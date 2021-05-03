const { getMeta, resetMeta, createEvent } = require('@posthog/plugin-scaffold/test/utils.js')
const { setupPlugin, parseCustomPropertiesMap } = require('../index')
// const { newCustomerEventProps } = require('./constants')
// const upcomingInvoiceRes = require('./upcoming-invoice.json')
// const customersRes = require('./customers.json')

global.fetch = jest.fn(async (url) => ({
    json: async () => {},
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
    expect(fetch).toHaveBeenCalledWith('https://api.sendgrid.com/v3/marketing/contacts/count', {
        method: 'GET',
        headers: {
            Authorization: 'Bearer SENDGRID_API_KEY'
        }
    })
})

test('setupPlugin fails if bad customProperties', async () => {
    resetMeta({
        config: {
            sendgridApiKey: 'SENDGRID_API_KEY',
            customProperties: 'asf=asdf=asf'
        }
    })

    await expect(setupPlugin(getMeta())).rejects.toThrow()
})

test('setupPlugin to accept valid customProperties', async () => {
    resetMeta({
        config: {
            sendgridApiKey: 'SENDGRID_API_KEY',
            customProperties: 'myProp1=my_prop1,my_prop2'
        }
    })

    await setupPlugin(getMeta())
})

test('parseCustomPropertiesMap', async () => {
    let inCustomProperties = 'myProp1=my_prop1,my_prop2'
    let wantCustomPropertiesMap = {
        myProp1: 'my_prop1',
        my_prop2: 'my_prop2'
    }

    expect(parseCustomPropertiesMap(inCustomProperties)).toStrictEqual(wantCustomPropertiesMap)
})
