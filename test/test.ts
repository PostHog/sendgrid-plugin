import { Meta } from '@posthog/plugin-scaffold'

import plugin, { SendGridMetaInput } from '../index'

const { setupPlugin, composeWebhook } = plugin

const meta: Meta<SendGridMetaInput> = {
    attachments: {},
    cache: {
        set: async () => {
            //
        },
        get: async () => {
            //
        },
        incr: async () => 1,
        expire: async () => true,
        lpush: async () => 1,
        lrange: async () => [],
        llen: async () => 1,
        lpop: async () => [],
        lrem: async () => 1,
    },
    config: {
        sendgridApiKey: 'SENDGRID_API_KEY',
        customFields: 'myProp1=my_prop1,my_prop2',
    },
    geoip: {
        locate: async () => null,
    },
    global: {},
    jobs: {},
    metrics: {},
    storage: {
        set: async () => {
            //
        },
        get: async () => {
            //
        },
        del: async () => {
            //
        },
    },
    utils: {
        cursor: {
            init: async () => {
                //
            },
            increment: async () => 1,
        },
    },
}

global.fetch = jest.fn(async (url) => ({
    json: async () =>
        url.includes('/field_definitions')
            ? {
                  custom_fields: [
                      { id: 'field1', name: 'my_prop1' },
                      { id: 'field2', name: 'my_prop2' },
                  ],
              }
            : {},
    status: 200,
})) as jest.Mock

describe('plugin tests', () => {
    beforeEach(() => {
        ;(fetch as jest.Mock).mockClear()
    })

    test('setupPlugin uses sendgridApiKey', async () => {
        if (!setupPlugin || !composeWebhook) {
            throw new Error('Not implemented')
        }

        expect(fetch).toHaveBeenCalledTimes(0)

        setupPlugin(meta)
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(fetch).toHaveBeenCalledWith('https://api.sendgrid.com/v3/marketing/field_definitions', {
            method: 'GET',
            headers: {
                Authorization: 'Bearer SENDGRID_API_KEY',
            },
        })
    })

    test('setupPlugin fails if bad customFields format', async () => {
        if (!setupPlugin || !composeWebhook) {
            throw new Error('Not implemented')
        }

        const metaWithBadCustomFieldsFormat: Meta<SendGridMetaInput> = {
            ...meta,
            config: { ...meta.config, customFields: 'asf=asdf=asf' },
        }

        await expect(setupPlugin(metaWithBadCustomFieldsFormat)).rejects.toThrow()
    })

    test('setupPlugin to accept valid customFields and parse them correctly', async () => {
        if (!setupPlugin || !composeWebhook) {
            throw new Error('Not implemented')
        }

        setupPlugin(meta)
        const { global } = meta
        expect(global.customFieldsMap).toStrictEqual({
            myProp1: 'field1',
            my_prop2: 'field2',
        })
    })

    test('returns null for event other than $identify', async () => {
        if (!setupPlugin || !composeWebhook) {
            throw new Error('Not implemented')
        }

        const mockEvent = {
            uuid: '10000000-0000-4000-0000-000000000000',
            team_id: 1,
            distinct_id: '1234',
            event: 'my-event',
            timestamp: new Date(),
            properties: {
                $ip: '127.0.0.1',
                $elements_chain: 'div:nth-child="1"nth-of-type="2"text="text"',
                foo: 'bar',
            },
        }

        setupPlugin(meta)

        expect(composeWebhook(mockEvent, meta)).toBeNull()
    })

    test('returns null for event missing email', async () => {
        if (!setupPlugin || !composeWebhook) {
            throw new Error('Not implemented')
        }

        const mockEvent = {
            uuid: '10000000-0000-4000-0000-000000000000',
            team_id: 1,
            distinct_id: '1234',
            event: '$identify',
            timestamp: new Date(),
            properties: {
                $ip: '127.0.0.1',
                $elements_chain: 'div:nth-child="1"nth-of-type="2"text="text"',
                foo: 'bar',
            },
        }

        setupPlugin(meta)

        expect(composeWebhook(mockEvent, meta)).toBeNull()
    })

    test('composeWebhooks to send contacts with custom fields', async () => {
        if (!setupPlugin || !composeWebhook) {
            throw new Error('Not implemented')
        }

        const mockEvent1 = {
            uuid: '10000000-0000-4000-0000-000000000000',
            team_id: 1,
            distinct_id: 'user0@example.org',
            event: '$identify',
            timestamp: new Date(),
            properties: {
                $ip: '127.0.0.1',
                $elements_chain: 'div:nth-child="1"nth-of-type="2"text="text"',
                foo: 'bar',
            },
            $set: {
                lastName: 'User0',
            },
        }

        const mockEvent2 = {
            uuid: '20000000-0000-4000-0000-000000000000',
            team_id: 1,
            distinct_id: '1234',
            event: '$identify',
            timestamp: new Date(),
            properties: {
                $ip: '127.0.0.1',
                $elements_chain: 'div:nth-child="1"nth-of-type="2"text="text"',
                foo: 'bar',
            },
            $set: {
                email: 'user1@example.org',
                lastName: 'User1',
                myProp1: 'foo',
            },
        }

        expect(fetch).toHaveBeenCalledTimes(0)
        setupPlugin(meta)
        expect(fetch).toHaveBeenCalledTimes(1)
        const webhook1 = composeWebhook(mockEvent1, meta)
        expect(webhook1).toHaveProperty('url', 'https://api.sendgrid.com/v3/marketing/contacts')
        expect(webhook1?.headers).toMatchObject({
            'Content-Type': 'application/json',
            Authorization: 'Bearer SENDGRID_API_KEY',
        })
        expect(webhook1).toHaveProperty('method', 'PUT')
        expect(webhook1).toHaveProperty('body')

        const webhook1BodyObj = await JSON.parse(webhook1?.body || '')
        expect(webhook1BodyObj).toMatchObject({
            contacts: [
                {
                    email: 'user0@example.org',
                    last_name: 'User0',
                    custom_fields: {},
                },
            ],
        })

        const webhook2 = composeWebhook(mockEvent2, meta)
        expect(webhook2).toHaveProperty('url', 'https://api.sendgrid.com/v3/marketing/contacts')
        expect(webhook2?.headers).toMatchObject({
            'Content-Type': 'application/json',
            Authorization: 'Bearer SENDGRID_API_KEY',
        })
        expect(webhook2).toHaveProperty('method', 'PUT')
        expect(webhook2).toHaveProperty('body')

        const webhook2BodyObj = await JSON.parse(webhook2?.body || '')
        expect(webhook2BodyObj).toMatchObject({
            contacts: [
                {
                    email: 'user1@example.org',
                    last_name: 'User1',
                    custom_fields: {
                        field1: 'foo',
                    },
                },
            ],
        })
    })
})
