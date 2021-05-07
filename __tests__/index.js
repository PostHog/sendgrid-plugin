const { getMeta, resetMeta } = require('@posthog/plugin-scaffold/test/utils.js')
const { setupPlugin, processEventBatch } = require('../index')

global.fetch = jest.fn(async (url) => ({
    json: async () =>
        url.includes('/field_definitions')
            ? {
                  custom_fields: [
                      { id: 'field1', name: 'my_prop1' },
                      { id: 'field2', name: 'my_prop2' }
                  ]
              }
            : {},
    status: 200
}))

beforeEach(() => {
    fetch.mockClear()

    resetMeta({
        config: {
            sendgridApiKey: 'SENDGRID_API_KEY'
        },
        global: global
    })
})

test('setupPlugin uses sendgridApiKey', async () => {
    expect(fetch).toHaveBeenCalledTimes(0)

    await setupPlugin(getMeta())
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('https://api.sendgrid.com/v3/marketing/field_definitions', {
        method: 'GET',
        headers: {
            Authorization: 'Bearer SENDGRID_API_KEY'
        }
    })
})

test('setupPlugin fails if bad customFields format', async () => {
    resetMeta({
        config: {
            sendgridApiKey: 'SENDGRID_API_KEY',
            customFields: 'asf=asdf=asf'
        }
    })

    await expect(setupPlugin(getMeta())).rejects.toThrow()
})

test('setupPlugin fails if custom field not defined in Sendgrid', async () => {
    resetMeta({
        config: {
            sendgridApiKey: 'SENDGRID_API_KEY',
            customFields: 'not_defined_custom_field'
        }
    })

    await expect(setupPlugin(getMeta())).rejects.toThrow()
})

test('setupPlugin to accept valid customFields and parse them correctly', async () => {
    resetMeta({
        config: {
            sendgridApiKey: 'SENDGRID_API_KEY',
            customFields: 'myProp1=my_prop1,my_prop2'
        }
    })

    await setupPlugin(getMeta())
    const { global } = getMeta()
    expect(global.customFieldsMap).toStrictEqual({
        myProp1: 'field1',
        my_prop2: 'field2'
    })
})

test('processEventBatch to send contacts with custom fields', async () => {
    resetMeta({
        config: {
            sendgridApiKey: 'SENDGRID_API_KEY',
            customFields: 'myProp1=my_prop1,my_prop2'
        }
    })

    const events = [
        {
            event: '$identify',
            distinct_id: 'user0@example.org',
            $set: {
                lastName: 'User0'
            }
        },
        {
            event: '$identify',
            $set: {
                email: 'user1@example.org',
                lastName: 'User1',
                myProp1: 'foo'
            }
        }
    ]

    expect(fetch).toHaveBeenCalledTimes(0)
    await setupPlugin(getMeta())
    expect(fetch).toHaveBeenCalledTimes(1)
    await processEventBatch(events, getMeta())
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith('https://api.sendgrid.com/v3/marketing/contacts', {
        method: 'PUT',
        headers: {
            Authorization: 'Bearer SENDGRID_API_KEY',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contacts: [
                {
                    email: 'user0@example.org',
                    last_name: 'User0',
                    custom_fields: {}
                },
                {
                    email: 'user1@example.org',
                    last_name: 'User1',
                    custom_fields: {
                        field1: 'foo'
                    }
                }
            ]
        })
    })
})
