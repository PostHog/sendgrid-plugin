async function setupPlugin({ config }) {
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

    for (let event of usefulEvents) {
        const email = getEmailFromIdentifyEvent(event)
        if (email) {
            let sendgridFilteredProps = {}
            for (const [key, val] of Object.entries(event['$set'] ?? {})) {
                if (sendgridPropsMap[key]) {
                    sendgridFilteredProps[sendgridPropsMap[key]] = val
                }
            }
            contacts.push({ email: email, ...sendgridFilteredProps })
        }
    }

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
        throw new Error('Unable to export contacts to Sendgrid')
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
