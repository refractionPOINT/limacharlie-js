const request = require("request")
const JSONStream = require("JSONStream")

class Spout {
  constructor(man, dataType, dataCb, errorCb, invId, tag, cat, sid) {
    this._man = man
    this._dataType = dataType
    this._invId = invId
    this._tag = tag
    this._cat = cat
    this._sid = sid
    this._spoutUrl = null
    this._dataCb = dataCb
    this.dropped = 0
    this.hasConnected = false
    this._specificCallbacks = {}
    this._cleanupTimer = setInterval(() => {this._cleanup()}, 30000)

    let url = `https://stream.limacharlie.io/${this._man._oid}`
    let spoutConf = {
      type: this._dataType,
    }
    
    if(this._man._secretApiKey) {
      spoutConf["api_key"] = this._man._secretApiKey
    } else {
      spoutConf["jwt"] = this._man._jwt
    }

    if(this._invId) {
      spoutConf["inv_id"] = this._invId
    }
    if(this._tag) {
      spoutConf["tag"] = this._tag
    }
    if(this._cat) {
      spoutConf["cat"] = this._cat
    }
    if(this._sid) {
      spoutConf["sid"] = this._sid
    }

    var isNode = false
    if (typeof window === "undefined") {
      isNode = true
    }

    // The Node HTTP POST and the browser one behave differently.
    // It is IMPOSSIBLE to prevent the browser from following the
    // redirect and since a stream is at that redirect we would
    // hang forever.
    if(isNode) {
      try {
        request
          .post(url)
          .form(spoutConf)
          .pipe(JSONStream.parse())
          .on("data", data => {
            this._processData(data)
          })
          .on("error", error => {
            if(errorCb) {
              errorCb(error)
            } else if(this._man.onError) {
              this._man.onError(error)
            } else {
              // eslint-disable-next-line no-console
              console.error(error)
            }
          })
      } catch(e) {
        if(errorCb) {
          errorCb(e)
        } else if(this._man.onError) {
          this._man.onError(e)
        } else {
          // eslint-disable-next-line no-console
          console.error(e)
        }
      }
    } else {
      this._stream = request
        .post(url)
        .form(spoutConf)
        .on("error", error => {
          if(errorCb) {
            errorCb(error)
          } else if(this._man.onError) {
            this._man.onError(error)
          } else {
            // eslint-disable-next-line no-console
            console.error(error)
          }
        })
        .pipe(JSONStream.parse())
        .on("data", data => {
          this._processData(data)
        })
        .on("error", error => {
          if(errorCb) {
            errorCb(error)
          } else if(this._man.onError) {
            this._man.onError(error)
          } else {
            // eslint-disable-next-line no-console
            console.error(error)
          }
        })
    }
  }
  
  registerSpecificCallback(trackingId, ttl, cb) {
    this._specificCallbacks[trackingId] = {
      cb: cb,
      ttl: ttl + new Date(),
    }
  }
  
  _processData(data) {
    if("__trace" in data) {
      if(data.__trace.includes("dropped")) {
        this.dropped += data.n
      } else if(data.__trace === "connected") {
        this.hasConnected = true
      }
    } else {
      let tracking = data.routing.investigation_id
      if(tracking && (tracking in this._specificCallbacks)) {
        // When a specific callback is registered, we do not feed 
        // the genecal callback.
        this._specificCallbacks[tracking].cb(data)
      } else if(this._dataCb) {
        this._dataCb(data)
      } else {
        // No specific callback for this tracking and no
        // general callback registered, so ignore.
      }
    }
  }
  
  _cleanup() {
    let now = 0 + new Date()
    for(let tracking in this._specificCallbacks) {
      let record = this._specificCallbacks[tracking]
      if(record.ttl < now) {
        delete this._specificCallbacks[tracking]
      }
    }
  }

  shutdown() {
    if(this._cleanupTimer) {
      clearInterval(this._cleanupTimer)
    }
    if(this._stream) {
      try {
        this._stream.abort()
      } catch(e) {
        // eslint-disable-next-line no-console
        console.error(e)
      }
      this._stream = null
    }
  }
}

module.exports = Spout