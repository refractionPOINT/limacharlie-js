const request = require('request-promise')
const Sensor = require('./Sensor')


const ROOT_URL = 'https://api.limacharlie.io'
const API_VERSION = 'v1'

const HTTP_UNAUTHORIZED = 401

class Manager {
    constructor(oid, secretApiKey) {
        this._oid = oid
        this._secretApiKey = secretApiKey
        this._jwt = null
        this._invId = null
        this._lastContinuationToken = null
    }

    async _refreshJWT(onSuccess, onError) {
        try{
            const data = await request(`https://app.limacharlie.io/jwt?oid=${this._oid}&secret=${this._secretApiKey}`, {json: true})
            this._jwt = data.jwt
            return true
        } catch(e) {
            console.error(`Failed to refresh the JWT: ${e}`)
            return false
        }
    }

    _restCall(url, verb, params) {
        if(!params) {
            params = {}
        }
        return request(`${ROOT_URL}/${API_VERSION}/${url}`, {
            headers: {
                Authorization: `bearer ${this._jwt}`
            },
            method: verb,
            form: params, qsStringifyOptions: {arrayFormat: 'repeat'},
            json: true,
        })
    }

    async _apiCall(url, verb, params, isNoRetry) {
        if(!this._jwt) {
            await this._refreshJWT()
        }

        try {
            return await this._restCall(url, verb, params)
        } catch(e) {
            if(e.statusCode === HTTP_UNAUTHORIZED && !isNoRetry) {
                await this._refreshJWT()
                return this._apiCall(url, verb, params, true)
            }
            if(e.error && e.error.error) {
                throw new Error(e.error.error)
            }
            throw e
        }
    }

    testAuth() {
        return this._refreshJWT()
    }

    sensor(sid, invId) {
        let s = new Sensor(this, sid)
        if(invId) {
            s.setInvId(invId)
        } else if(this._invId) {
            s.setInvId(this._invId)
        }
        return s
    }

    async sensors(invId, isNext) {
        let sensors = []
        let params = {}
        if(isNext) {
            if(!this._lastContinuationToken) {
                return []
            }
            params['continuation_token'] = this._lastContinuationToken
            this._lastContinuationToken = null
        }
        
        const data = await this._apiCall(`sensors/${this._oid}`, 'GET', params)

        if(data.continuation_token) {
            this._lastContinuationToken = data.continuation_token
        }

        let thisInv = invId
        if(!thisInv) {
            thisInv = this._invId
        }

        return data.sensors.map(s => {
            return this.sensor(s.sid, thisInv)
        })
    }
}

module.exports = Manager
