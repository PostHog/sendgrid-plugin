async function setupPlugin({ config }) {
    try {
        parseCustomFieldsMap(config.customFields)
    } catch (e) {
        throw new Error('Invalid format for custom properties: ' + e)
    }

    const authResponse = await fetchWithRetry('https://api.sendgrid.com/v3/marketing/contacts/count', {
        headers: {
            Authorization: `Bearer ${config.sendgridApiKey}`
        }
    })

    if (!statusOk(authResponse)) {
        throw new Error('Unable to connect to Sendgrid')
    }
}

async function processEventBatch(events, { config }) {
    let contacts = []
    let usefulEvents = [...events].filter((e) => e.event === '$identify')
    let customFieldsMap = parseCustomFieldsMap(config.customFields)

    for (let event of usefulEvents) {
        const email = getEmailFromIdentifyEvent(event)
        if (email) {
            let sendgridFilteredProps = {}
            let customFields = {}
            for (const [key, val] of Object.entries(event['$set'] ?? {})) {
                if (sendgridPropsMap[key]) {
                    sendgridFilteredProps[sendgridPropsMap[key]] = val
                } else if (customFieldsMap[key]) {
                    customFields[customFieldsMap[key]] = val
                }
            }
            contacts.push({
                email: email,
                ...sendgridFilteredProps,
                custom_fields: customFields
            })
        }
    }

    if (contacts.length > 0) {
        const exportContactsResponse = await fetchWithRetry(
            'https://api.sendgrid.com/v3/marketing/contacts',
            {
                headers: {
                    Authorization: `Bearer ${config.sendgridApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ contacts: contacts })
            },
            'PUT'
        )

        if (!statusOk(exportContactsResponse)) {
            let errorText = ''
            try {
                errorText = await exportContactsResponse.text()
            } catch (e) {
                // noop
            } finally {
                throw new Error(
                    `Unable to export ${contacts.length} contacts to Sendgrid: ${errorText || 'cannot get error text'}`
                )
            }
        }
    }

    return events
}

async function fetchWithRetry(url, options = {}, method = 'GET', isRetry = false) {
    try {
        const res = await fetch(url, { method: method, ...options })
        return res
    } catch {
        if (isRetry) {
            throw new Error(`${method} request to ${url} failed.`)
        }
        const res = await fetchWithRetry(url, options, (method = method), (isRetry = true))
        return res
    }
}

function isEmail(email) {
    const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    return re.test(String(email).toLowerCase())
}

function getEmailFromIdentifyEvent(event) {
    return isEmail(event.distinct_id)
        ? event.distinct_id
        : !!event['$set'] && Object.keys(event['$set']).includes('email')
        ? event['$set']['email']
        : ''
}

function statusOk(res) {
    return String(res.status)[0] === '2'
}

const sendgridPropsMap = {
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
    postal_code: 'postal_code'
}

// parseCustomFieldsMap parses custom properties in a format like "myProp1=my_prop1,my_prop2".
function parseCustomFieldsMap(customProps) {
    const result = {}
    if (customProps) {
        customProps.split(',').forEach((prop) => {
            const parts = prop.split('=')
            if (parts.length == 1) {
                result[parts[0]] = parts[0]
            } else if (parts.length == 2) {
                result[parts[0]] = parts[1]
            } else {
                throw new Error(`bad format in '${prop}'`)
            }
        })
    }
    return result
}

module.exports = {
    setupPlugin,
    parseCustomFieldsMap
}
