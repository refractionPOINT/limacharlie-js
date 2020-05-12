const request = require("request-promise")
const zlib = require('zlib')
const Sensor = require("./Sensor")
const Spout = require("./Spout")
const Job = require("./Job")
const Payloads = require("./Payload")

const ROOT_URL = "https://api.limacharlie.io"
const API_VERSION = "v1"

const HTTP_UNAUTHORIZED = 401
const HTTP_BAD_REQUEST = 400
const HTTP_TOO_MANY_REQUESTS = 429

class Manager {
  constructor(oid, secretApiKey, invId, isInteractive, jwt, onAuthFailure, onError) {
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
    this.onError = onError

    if(this._isInteractive) {
      this._spout = new Spout(this, "event", null, null, this._invId, null, null, null, true)
    }
    this.payloads = new Payloads(this)
  }

  async _refreshJWT() {
    try{
      if(!this._secretApiKey) {
        throw new Error("API key not set.")
      }
      let req = {
        method: "POST",
        json: true,
        timeout: 5 * 1000,
        form: {
          oid: this._oid,
          secret: this._secretApiKey,
        }
      }
      const data = await request(`https://app.limacharlie.io/jwt`, req)
      this._jwt = data.jwt
      return true
    } catch(e) {
      // eslint-disable-next-line no-console
      console.error(`Failed to refresh the JWT: ${e}`)
      return false
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _restCall(url, verb, params, timeout, altRoot) {
    if(!this._oid) {
      return
    }
    if(!timeout) {
      timeout = 10 * 1000
    }
    if(!params) {
      params = {}
    }
    let req = {
      headers: {
        Authorization: `bearer ${this._jwt}`
      },
      method: verb,
      qsStringifyOptions: {arrayFormat: "repeat"},
      json: true,
      timeout: timeout,
    }
    if(verb === "GET") {
      req[ "qs" ] = params
    } else {
      req[ "form" ] = params
    }
    if(altRoot) {
      return request(`${altRoot}/${url}`, req)
    }
    return request(`${ROOT_URL}/${API_VERSION}/${url}`, req)
  }

  async _apiCall(url, verb, params, isNoRetry, isThrowError, timeout, altRoot) {
    if(!this._jwt) {
      await this._refreshJWT()
    }

    try {
      return await this._restCall(url, verb, params, timeout, altRoot)
    } catch(e) {
      console.error(e)
      let errMessage = null
      if(e.error && e.error.error) {
        errMessage = e.error.error
      } else {
        errMessage = e.toString()
      }
      if(typeof errMessage != "string" && "error" in errMessage) {
        errMessage = errMessage["error"]
      }
      if(e.statusCode === HTTP_UNAUTHORIZED && !isNoRetry) {
        if(this.onAuthFailure) {
          await this.onAuthFailure()
        } else {
          await this._refreshJWT()
        }
        return this._apiCall(url, verb, params, true)
      } else if(e.statusCode === HTTP_TOO_MANY_REQUESTS && !isNoRetry) {
        await this.sleep(10 * 1000)
        return this._apiCall(url, verb, params, false)
      } else if(errMessage.includes("RequestError") && !isNoRetry) {
        // Looks like a failure to connect or at the gateway, just retry once.
        await this.sleep(1 * 1000)
        return this._apiCall(url, verb, params, true)
      }

      if(this.onError) {
        this.onError(errMessage)
      }

      if(isThrowError) {
        throw new Error(errMessage)
      }
    }
  }

  async _unzip(data, isBinary) {
    return new Promise(function(resolve, reject) {
      zlib.unzip(data, (err, buffer) => {
        if(err) {
          return reject(err)
        }
        resolve(buffer.toString(isBinary ? 'binary' : 'utf8'))
      })
    })
  }

  shutdown() {
    if(this._spout) {
      this._spout.shutdown()
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

  async getAvailableEvents() {
    return (await this._apiCall("events", "GET")).events
  }

  async getAutoComplete(aid) {
    let params = null
    if(aid) {
      params = {
        aid: aid,
      }
    }
    return await this._apiCall("autocomplete/task", "GET", params)
  }

  async getSensorsWithHostname(hostnamePrefix) {
    let data = await this._apiCall(`hostnames/${this._oid}`, "GET", {
      hostname: hostnamePrefix
    })
    return data.sid
  }

  async isInsightEnabled() {
    let insightConfig = await this._apiCall(`insight/${this._oid}`, "GET")
    if(insightConfig && ("insight_bucket" in insightConfig) && insightConfig["insight_bucket"]) {
      return true
    }
    return false
  }

  async getHistoricDetections(params) {
    if(!params) {
      params = {}
    }
    params["is_compressed"] = "true"
    let data = await this._apiCall(`insight/${this._oid}/detections`, "GET", params, false, false, 30 * 1000)
    data.events = await this._unzip(Buffer.from(data.detects, "base64"))
    data.events = JSON.parse(data.events)
    return data
  }

  async deleteAllHistoricDetections() {
    let data = await this._apiCall(`insight/${this._oid}/detections`, "DELETE", {}, false, false, 60 * 1000 * 10)
    return data
  }

  async getObjectInformation(objType, objName, params) {
    if(!params) {
      params = {}
    }
    params["name"] = objName
    let data = await this._apiCall(`insight/${this._oid}/objects/${objType}`, "GET", params)
    return data
  }

  async getObjectBatchInformation(objects, params) {
    if(!params) {
      params = {}
    }
    params["objects"] = JSON.stringify(objects)
    let data = await this._apiCall(`insight/${this._oid}/objects`, "POST", params)
    return data
  }

  async getObjectBaseline() {
    let winBin = "ntdll.dll"
    let macBin = "launchd"
    let objects = await this.getObjectBatchInformation({
      file_name: [
        winBin,
        macBin,
      ]
    })
    return {
      windows:{last_1_days: objects.last_1_days.file_name[winBin], last_7_days: objects.last_7_days.file_name[winBin], last_30_days: objects.last_30_days.file_name[winBin]},
      mac:{last_1_days: objects.last_1_days.file_name[macBin], last_7_days: objects.last_7_days.file_name[macBin], last_30_days: objects.last_30_days.file_name[macBin]},
    }
  }

  async getTrafficBreakdown(start, end) {
    let data = await this._apiCall(`insight/${this._oid}/traffic/breakdown`, "GET", {
      start: start,
      end: end,
    })
    return data
  }

  async getOnlineStats(start, end, sid) {
    let params = {
      start: start,
      end: end,
    }
    if(sid) {
      params["sid"] = sid
    }
    let data = await this._apiCall(`insight/${this._oid}/online/stats`, "GET", params)
    return data
  }

  async getTrafficStats(start, end, sid) {
    let params = {
      start: start,
      end: end,
    }
    if(sid) {
      params["sid"] = sid
    }
    let data = await this._apiCall(`insight/${this._oid}/traffic/stats`, "GET", params)
    return data
  }

  async getDetectBreakdown(start, end) {
    let data = await this._apiCall(`insight/${this._oid}/detections/breakdown`, "GET", {
      start: start,
      end: end,
    })
    return data
  }

  async getDetectStats(start, end, sid) {
    let params = {
      start: start,
      end: end,
    }
    if(sid) {
      params["sid"] = sid
    }
    let data = await this._apiCall(`insight/${this._oid}/detections/stats`, "GET", params)
    return data
  }

  async getJobs(params) {
    if(!params) {
      params = {}
    }
    params["is_compressed"] = "true"
    let data = await this._apiCall(`job/${this._oid}`, "GET", params)
    data.jobs = await this._unzip(Buffer.from(data.jobs, "base64"))
    data.jobs = JSON.parse(data.jobs)
    return Object.values(data.jobs).map(i => new Job(this, i))
  }

  async getJob(jid) {
    params["is_compressed"] = "true"
    let data = await this._apiCall(`job/${this._oid}/${jid}`, "GET", {})
    data.job = await this._unzip(Buffer.from(data.jobs, "base64"))
    data.job = JSON.parse(data.job)
    return new Job(this, data.job)
  }

  async replicantRequest(replicantName, params, isSynchronous, timeout) {
    if(!timeout) {
      timeout = 30 * 1000
    }
    let data = await this._apiCall(`replicant/${this._oid}/${replicantName}`, "POST", {
      request_data: btoa(JSON.stringify(params)),
      is_async: !isSynchronous,
    }, false, false, timeout)
    return data
  }

  async getAvailableReplicants() {
    let data = await this._apiCall(`replicant/${this._oid}`, "GET")
    return data.replicants
  }

  async getOrgInfo() {
    let data = await this._apiCall(`orgs/${this._oid}`, "GET")
    return data
  }

  async getInsightLogs(start, end, source, hint, cursor) {
    let params = {
      start: start,
      end: end,
    }
    if(source) {
      params["source"] = source
    }
    if(hint) {
      params["hint"] = hint
    }
    if(cursor) {
      params["cursor"] = cursor
    }
    let data = await this._apiCall(`insight/${this._oid}/logs`, "GET", params)
    return data.logs
  }

  async getInsightLogPayload(payloadID, records, with_raw) {
    let params = {
      records: records,
      with_raw: with_raw ? 'on' : 'off',
      is_compressed: 'true',
    }
    let data = await this._apiCall(`insight/${this._oid}/logs/payloads/${payloadID}`, "GET", params, false, false, 60 * 1000)

    data.logs = await this._unzip(Buffer.from(data.logs, "base64"))
    data.logs = JSON.parse(data.logs)

    return data.logs
  }

  async getInsightLogOriginal(payloadID) {
    let params = {}
    let data = await this._apiCall(`insight/${this._oid}/logs/originals/${payloadID}`, "GET", params, false, false, 60 * 1000)

    if(data.payload) {
      data.payload = await this._unzip(Buffer.from(data.payload, "base64"), true)
    } else {
      data.payload = null
    }

    return data
  }

  async getInsightLogFlow(flowID, start, end, with_raw) {
    let params = {
      start: start,
      end: end,
      with_raw: with_raw ? 'on' : 'off',
      is_compressed: 'true',
    }
    let data = await this._apiCall(`insight/${this._oid}/logs/flows/${flowID}`, "GET", params)

    data.flows = await this._unzip(Buffer.from(data.flows, "base64"))
    data.flows = JSON.parse(data.flows)

    return data.flows
  }

  async getIngestionKeys() {
    let data = await this._apiCall(`insight/${this._oid}/ingestion_keys`, "GET", {})
    return data.keys
  }

  async setIngestionKey(name) {
    let data = await this._apiCall(`insight/${this._oid}/ingestion_keys`, "POST", {
      name: name,
    })
    return data
  }

  async delIngestionKey(name) {
    let data = await this._apiCall(`insight/${this._oid}/ingestion_keys`, "DELETE", {
      name: name,
    })
    return data
  }

  async getUsage() {
    let data = await this._apiCall(`usage/${this._oid}`, "GET", {}, false, false, 20 * 1000)
    return data.usage
  }

  async getDrRules(namespace) {
    let req = {}
    if(namespace) {
      req['namespace'] = namespace
    }
    let data = await this._apiCall(`rules/${this._oid}`, "GET", req)
    return data
  }

  async getFpRules() {
    let req = {}
    let data = await this._apiCall(`fp/${this._oid}`, "GET", req)
    return data
  }

  async getObjectsTimeline(objects, params) {
    if(!params) {
      params = {}
    }
    params["is_compressed"] = "true"
    params["objects"] = JSON.stringify(objects)
    let data = await this._apiCall(`insight/${this._oid}/objects_timeline`, "POST", params)
    data.timeline = await this._unzip(Buffer.from(data.timeline, "base64"))
    data.timeline = JSON.parse(data.timeline)
    data.prevalence = await this._unzip(Buffer.from(data.prevalence, "base64"))
    data.prevalence = JSON.parse(data.prevalence)
    return data
  }

  async getObjectUsage(objType, objName, startTime, endTime, params) {
    if(!params) {
      params = {}
    }
    params["is_compressed"] = "true"
    params["name"] = objName
    params["start"] = startTime
    params["end"] = endTime
    let data = await this._apiCall(`insight/${this._oid}/object_usage/${objType}`, "GET", params)
    data.usage = await this._unzip(Buffer.from(data.usage, "base64"))
    data.usage = JSON.parse(data.usage)
    data.logs = await this._unzip(Buffer.from(data.logs, "base64"))
    data.logs = JSON.parse(data.logs)
    return data
  }

  async whoAmI() {
    let data = await this._apiCall(`who`, "GET", {}, false, false, null, ROOT_URL)
    return data
  }

  async getSensorsOnline(sids) {
    let params = {
      'sids' : sids,
    }
    let data = await this._apiCall(`online/${this._oid}`, "POST", params)
    return data
  }
}

module.exports = Manager
