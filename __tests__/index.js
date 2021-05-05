const { getMeta, resetMeta, createEvent } = require('@posthog/plugin-scaffold/test/utils.js')
const { setupPlugin, parseCustomPropertiesMap } = require('../index')
// const { newCustomerEventProps } = require('./constants')
// const upcomingInvoiceRes = require('./upcoming-invoice.json')
// const customersRes = require('./customers.json')

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

global.posthog = {
    capture: jest.fn(() => true)
}

storage = {
    get: jest.fn(() => ''),
    set: jest.fn(() => '')
}

cache = {
    get: jest.fn(() => ''),
    set: jest.fn(() => '')
}

beforeEach(() => {
    fetch.mockClear()
    posthog.capture.mockClear()

    resetMeta({
        config: {
            sendgridApiKey: 'SENDGRID_API_KEY'
        },
        global: global,
        storage: storage,
        cache: cache
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
    expect(global.posthogPropsToSendgridCustomFieldIDsMap).toStrictEqual({
        myProp1: 'field1',
        my_prop2: 'field2'
    })
})
