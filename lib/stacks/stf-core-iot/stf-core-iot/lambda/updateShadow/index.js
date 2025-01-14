const aws = require('aws-sdk')
const iot_endpoint = process.env.AWSIOTENDPOINT 
const iot_region = process.env.AWSIOTREGION 
const iotdata = new aws.IotData({endpoint: iot_endpoint, region: iot_region})
const shadow_prefix = process.env.SHADOW_PREFIX
const url_broker = process.env.URL_CONTEXT_BROKER
const timeout = parseInt(process.env.TIMEOUT)


exports.handler = async (event, context) => {
    try {
    
        for await (let msg of event.Records){
            let payload = JSON.parse(msg.body)

            if(!payload.id || !payload.type){
                throw new Error('Invalid entity - id or type is missing')
            }

            const thingName = `${payload.id.split(':').slice(-1)}`
            
            try {
                const shadow_payload = {
                    state: {
                        reported: payload
                    }
                }
                
                let updateThingShadow = await iotdata.updateThingShadow({payload: JSON.stringify(shadow_payload), thingName: thingName, shadowName: `${shadow_prefix}-${payload.type}`}).promise()
            
            } catch (e) {
                log_error(event,context, e.message, e)
            }

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