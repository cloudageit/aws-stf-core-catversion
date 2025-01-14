const axios = require('axios')
const aws = require('aws-sdk')
const iot_endpoint = process.env.AWSIOTENDPOINT 
const iot_region = process.env.AWSIOTREGION 
const iotdata = new aws.IotData({endpoint: iot_endpoint, region: iot_region})
const shadow_prefix = process.env.SHADOW_PREFIX
const dns_broker = `http://${process.env.DNS_CONTEXT_BROKER}/ngsi-ld/v1`
const timeout = parseInt(process.env.TIMEOUT)
const URL_SMART_DATA_MODEL = process.env.URL_SMART_DATA_MODEL


exports.handler = async (event, context) => {

    try {
        let entities = []

        for await (let msg of event.Records){
            let payload = JSON.parse(msg.body)
            const thingName = `${payload.id.split(':').slice(-1)}`
            if(!payload.id || !payload.type){
                throw new Error('Invalid entity: id or type is missing')
            }

            // Check if location property is in the payload. If not, get it from the Stf-Device named shadow 
            if(!payload.location && payload.type != 'Device') {
                
                try {
                    let {payload : device_shadow} = await iotdata.getThingShadow({
                        thingName: thingName,
                        shadowName: `${shadow_prefix}-Device`
                    }).promise()

                    device_shadow = JSON.parse(device_shadow)
                    payload.location = device_shadow.state.reported.location

                    if(payload.location){
                        const shadow_payload = {
                            state: {
                                reported: payload
                            }
                        }
                        let updateThingShadow = await iotdata.updateThingShadow({
                            payload: JSON.stringify(shadow_payload), 
                            thingName: thingName, 
                            shadowName: `${shadow_prefix}-${payload.type}`
                        }).promise()
                    }



                } catch (e) {
                    console.log(e.message)
                }
            }
            if (payload.raw) delete payload.raw
            entities.push(payload)
        }
        const headers = {
            'Content-Type': 'application/json',
            'Link': `<${URL_SMART_DATA_MODEL}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`
            }
        try {
            let upsert = await axios.post(`${dns_broker}/entityOperations/upsert`, entities, {headers: headers, timeout: timeout}) 
        } catch (e) {
            log_error(event,context, e.message, e)  
        }
    } catch (e) {
        log_error(event,context, e.message, e)
    }
}


const log_error = (event, context, message, error) => {
    console.error(JSON.stringify({
        message: message,
        event: event,
        error: error, 
        context: context
    }))
}

