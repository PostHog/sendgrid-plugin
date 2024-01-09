import { Plugin, PostHogEvent, Webhook } from '@posthog/plugin-scaffold'

export interface SendGridMetaInput {
    config: {
        customFields?: string // "myProp1=my_prop1,my_prop2"
        sendgridApiKey: string
    }
}

const sendgridPropsMap: Record<string, string> = {
    lastName: 'last_name',
    last_name: 'last_name',
    lastname: 'last_name',
    firstName: 'first_name',
    first_name: 'first_name',
    firstname: 'first_name',
    city: 'city',
    country: 'country',
    postCode: 'postal_code',
    post_code: 'postal_code',
    postalCode: 'postal_code',
    postal_code: 'postal_code',
}

const plugin: Plugin<SendGridMetaInput> = {
    composeWebhook: (event, { config, global }) => {
        if (event.event !== '$identify') {
            return null
        }

        const customFieldsMap = global.customFieldsMap as Record<string, string>

        const email = getEmailFromIdentifyEvent(event)

        if (!email) {
            return null
        }

        const sendgridFilteredProps: Record<string, string> = {}
        const customFields: Record<string, string> = {}

        if ('$set' in event) {
            for (const [key, val] of Object.entries(event['$set'] ?? {})) {
                if (key in sendgridPropsMap) {
                    sendgridFilteredProps[sendgridPropsMap[key]] = val
                } else if (key in customFieldsMap) {
                    customFields[customFieldsMap[key]] = val
                }
            }
        }

        return {
            body: JSON.stringify({
                contacts: [
                    {
                        email: email,
                        ...sendgridFilteredProps,
                        custom_fields: customFields,
                    },
                ],
            }),
            headers: {
                Authorization: `Bearer ${config.sendgridApiKey}`,
                'Content-Type': 'application/json',
            },
            method: 'PUT',
            url: 'https://api.sendgrid.com/v3/marketing/contacts',
        } as Webhook
    },
    setupPlugin: async ({ config, global }) => {
        // With this call we validate the API Key and also we get the list of custom fields, which will be needed
        // to configure the map between PostHog and Sendgrid.
        const fieldsDefResponse = await fetch('https://api.sendgrid.com/v3/marketing/field_definitions', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${config.sendgridApiKey}`,
            },
        })
        if (!statusOk(fieldsDefResponse)) {
            throw new Error('Unable to connect to Sendgrid')
        }

        const fieldsDef = await fieldsDefResponse.json()

        // Custom fields in Sendgrid have a name and an ID. The name is what users configure when they create a custom field,
        // and ID is automatically assigned by Sendgrid.
        // In the config of this plugin, users configure the map between PostHog prop names and Sendgrid custom fields names.
        // Here we resolve the relation and calculate a map between PostHog prop names and Sendgrid custom field IDs.

        let posthogPropsToSendgridCustomFieldNamesMap = {}
        try {
            posthogPropsToSendgridCustomFieldNamesMap = parseCustomFieldsMap(config.customFields || '')
        } catch (e) {
            throw new Error('Invalid format for custom fields')
        }

        const posthogPropsToSendgridCustomFieldIDsMap: Record<string, string> = {}
        for (const [posthogProp, sendgridCustomFieldName] of Object.entries(
            posthogPropsToSendgridCustomFieldNamesMap
        )) {
            const cfIndex = Object.keys(fieldsDef.custom_fields || {}).filter(
                (key) => fieldsDef.custom_fields[key].name === sendgridCustomFieldName
            )
            if (cfIndex.length !== 1) {
                throw new Error(`Custom field with name ${sendgridCustomFieldName} is not defined in Sendgrid`)
            }
            posthogPropsToSendgridCustomFieldIDsMap[posthogProp] = fieldsDef.custom_fields[cfIndex[0]].id
        }

        global.customFieldsMap = posthogPropsToSendgridCustomFieldIDsMap
    },
}

export default plugin

function isEmail(email: string) {
    const re =
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    return re.test(String(email).toLowerCase())
}

function getEmailFromIdentifyEvent(event: PostHogEvent): string {
    if (isEmail(event.distinct_id)) {
        return event.distinct_id
    }

    if (
        '$set' in event &&
        event['$set'] !== null &&
        typeof event['$set'] === 'object' &&
        'email' in event['$set'] &&
        typeof event['$set']['email'] === 'string'
    ) {
        return event['$set']['email']
    }
    return ''
}

function statusOk(res: Response) {
    return String(res.status)[0] === '2'
}

// parseCustomFieldsMap parses custom properties in a format like "myProp1=my_prop1,my_prop2".
function parseCustomFieldsMap(customProps: string) {
    const result: Record<string, string> = {}
    if (customProps) {
        customProps.split(',').forEach((prop) => {
            const parts = prop.split('=')
            if (parts.length == 1) {
                result[parts[0]] = parts[0]
            } else if (parts.length == 2) {
                result[parts[0]] = parts[1]
            } else {
                throw new Error(`Bad format in '${prop}'`)
            }
        })
    }
    return result
}
