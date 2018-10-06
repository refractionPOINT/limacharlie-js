const request = require("request-promise")
const Sensor = require("./Sensor")
const Spout = require("./Spout")

const ROOT_URL = "https://api.limacharlie.io"
const API_VERSION = "v1"

const HTTP_UNAUTHORIZED = 401

class Manager {
  constructor(oid, secretApiKey, invId, isInteractive, jwt, onAuthFailure) {
    this._oid = oid
    this._secretApiKey = secretApiKey
    this._jwt = jwt
    this._invId = invId
    this._isInteractive = isInteractive
    if(this._isInteractive && !this._invId) {
      throw new Error("Investigation ID must be set for interactive mode to be eneabled.")
    }
    this._spout = null
    this._lastContinuationToken = null
    // If the onAuthFailure callback is set, the internal renewal of
    // the JWT using the API key is disable. We assume the callback is
    // responsible for updating the JWT and setting it in manager._jwt.
    // The async callback receives no parameters, a reference to
    // this Manager. After callback, the API call will automatically
    // be retried like the normal API Key based behavior.
    this.onAuthFailure = onAuthFailure
    
    if(this._isInteractive) {
      this.refreshSpout()
    }
  }

  async _refreshJWT() {
    try{
      if(!this._secretApiKey) {
        throw new Error("API key not set.")
      }
      const data = await request(`https://app.limacharlie.io/jwt?oid=${this._oid}&secret=${this._secretApiKey}`, {json: true})
      this._jwt = data.jwt
      return true
    } catch(e) {
      this._jwt = null
      // eslint-disable-next-line no-console
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
      form: params, qsStringifyOptions: {arrayFormat: "repeat"},
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
        if(this.onAuthFailure) {
          await this.onAuthFailure()
        } else {
          await this._refreshJWT()
        }
        return this._apiCall(url, verb, params, true)
      }
      if(e.error && e.error.error) {
        throw new Error(e.error.error)
      }
      throw e
    }
  }
  
  refreshSpout() {
    if(!this._isInteractive) {
      return
    }
    
    // We use a temporary variable so we can do a hot swap and never
    // be without an active spout.
    let tmpSpout = this._spout
    this._spout = new Spout(this, "event", null, null, this._invId, null, null)
    
    if(tmpSpout) {
      // Move over the registrations in the previous spout to the new one.
      this._spout._specificCallbacks = tmpSpout._specificCallbacks
      
      // Now we can close it down safely.
      tmpSpout.shutdown()
      tmpSpout = null
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
    let params = {}
    if(isNext) {
      if(!this._lastContinuationToken) {
        return []
      }
      params["continuation_token"] = this._lastContinuationToken
      this._lastContinuationToken = null
    }
        
    const data = await this._apiCall(`sensors/${this._oid}`, "GET", params)

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
