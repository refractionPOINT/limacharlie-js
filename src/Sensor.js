const uuid = require("uuid4")

class Sensor {
  constructor(manager, sid) {
    this._man = manager
    this.sid = sid
    this._invId = null
    this._info = null
  }

  setInvId(invId) {
    this._invId = invId
  }

  async task(tasks, invId, isThrowError) {
    if(!Array.isArray(tasks)) {
      tasks = [tasks]
    }
    let req = {
      tasks: tasks,
    }
    let thisInv = invId
    if(!thisInv) {
      thisInv = this._invId
    }
    if(thisInv) {
      req["investigation_id"] = thisInv
    }
    return await this._man._apiCall(this.sid, "POST", req, false, isThrowError)
  }

  async request(tasks, responseCb, onError) {
    if(!this._man._isInteractive) {
      throw new Error("Manager provided was not created with isInteractive set to true, cannot track responses.")
    }
    let trackingId = `${this._man._invId}/${uuid()}`
    this._man._spout.registerSpecificCallback(trackingId, 60, (data) => {
      responseCb(data)
    })
    if(onError) {
      try {
        return await this.task(tasks, trackingId, true)
      } catch(e) {
        onError(e)
      }
    }
    return await this.task(tasks, trackingId)
  }

  asAid() {
    if(!this._info) {
      this.getInfo()
      return null
    }
    return `${this._info.oid}.${this._info.iid}.${this._info.sid}.${this._info.plat.toString(16)}.${this._info.arch}`
  }

  isWindows() {
    if(!this._info) {
      this.getInfo()
      return null
    }
    return this._info.plat === 0x10000000
  }

  isLinux() {
    if(!this._info) {
      this.getInfo()
      return null
    }
    return this._info.plat === 0x20000000
  }

  isMac() {
    if(!this._info) {
      this.getInfo()
      return null
    }
    return this._info.plat === 0x30000000
  }

  isAndroid() {
    if(!this._info) {
      this.getInfo()
      return null
    }
    return this._info.plat === 0x50000000
  }

  isChrome() {
    if(!this._info) {
      this.getInfo()
      return null
    }
    return this._info.arch === 0x00000006
  }

  isVPN() {
    if(!this._info) {
      this.getInfo()
      return null
    }
    return this._info.plat === 0x70000000
  }

  async hostname() {
    if(!this._info) {
      await this.getInfo()
    }
    return this._info.hostname
  }

  async tag(tag, ttl) {
    return await this._man._apiCall(`${this.sid}/tags`, "POST", {
      tags: tag,
      ttl: ttl
    })
  }

  async untag(tag) {
    return await this._man._apiCall(`${this.sid}/tags`, "DELETE", {
      tag: tag,
    })
  }

  async getTags() {
    const data = await this._man._apiCall(`${this.sid}/tags`, "GET")
    return Object.keys(data.tags[this.sid])
  }

  async getInfo() {
    const data = await this._man._apiCall(this.sid, "GET")
    this._info = data.info
    return data.info
  }

  async isOnline() {
    const data = await this._man._apiCall(this.sid, "GET")
    return (data && data.online && !("error" in data.online)) ? true : false
  }

  async getHistoricEvents(params) {
    params["is_compressed"] = "true"
    let data = await this._man._apiCall(`insight/${this._man._oid}/${this.sid}`, "GET", params)
    data.events = await this._man._unzip(Buffer.from(data.events, "base64"))
    data.events = JSON.parse(data.events)
    return data
  }

  getHistoricEventsGenerator(start, end, limit, eventType, isBackwards) {
    return new EventsGenerator(this, start, end, limit, eventType, isBackwards)
  }

  async getSpecificEvent(atom, before) {
    let data = await this._man._apiCall(`insight/${this._man._oid}/${this.sid}/${atom}`, "GET", {
      before: before,
    }, false, false, 30 * 1000)
    return data
  }

  async getHistoricOverview(params) {
    let data = await this._man._apiCall(`insight/${this._man._oid}/${this.sid}/overview`, "GET", params)
    return data.overview
  }

  async getTrafficStats(start, end) {
    return await this._man.getTrafficStats(start, end, this.sid)
  }
}

class EventsGenerator {
  constructor(sensor, start, end, limit, eventType, isBackwards) {
    this._sensor = sensor
    this._start = start
    this._end = end
    this._limit = limit
    this._eventType = eventType
    this._cursor = "-"
    this._ready = []
    this._isForwards = !isBackwards
  }

  async next() {
    if(this._ready.length !== 0) {
      return this._ready.shift()
    }
    if(!this._cursor) {
      return null
    }
    let params = {
      is_compressed: "true",
      cursor: this._cursor,
      is_forward: this._isForwards,
    }
    if(this._start) {
      params["start"] = this._start
    }
    if(this._end) {
      params["end"] = this._end
    }
    if(this._limit) {
      params["limit"] = this._limit
    }
    if(this._eventType) {
      params["event_type"] = this._eventType
    }
    while(this._cursor) {
        let data = await this._sensor._man._apiCall(`insight/${this._sensor._man._oid}/${this._sensor.sid}`, "GET", params)
        let events = await this._sensor._man._unzip(Buffer.from(data.events, "base64"))
        events = JSON.parse(events)
        this._cursor = data.next_cursor
        this._ready = events
        if(this._ready.length !== 0) {
          break
        }
    }
    return this._ready.shift()
  }
}

module.exports = Sensor
