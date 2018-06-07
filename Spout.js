const request = require('request')
const JSONStream = require('JSONStream')

class Spout {
    constructor(man, dataType, dataCb, errorCb, invId, tag, cat) {
        this._man = man
        this._dataType = dataType
        this._invId = invId
        this._tag = tag
        this._cat = cat
        this._spoutUrl = null
        this._dataCb = dataCb

        let url = `https://output.limacharlie.io/output/${this._man._oid}`
        let spoutConf = {
            api_key: this._man._secretApiKey,
            type: this._dataType,
        }

        if(this._invId) {
            spoutConf['inv_id'] = this._invId
        }
        if(this._tag) {
            spoutConf['tag'] = this._tag
        }
        if(this._cat) {
            spoutConf['cat'] = this._cat
        }

        var isNode = false;
        if (typeof window === 'undefined') {
            isNode = true;
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
                .on('response', (response) => {
                    this._spoutUrl = response.headers.location
                    
                    try {
                        this._stream = request.get(this._spoutUrl)
                    } catch(e) {
                        if(errorCb) {
                            errorCb(e)
                        } else {
                            console.error(e)
                        }
                    }

                    this._stream.pipe(JSONStream.parse())
                    .on('data', data => {
                        this._dataCb(data)
                    })
                    .on('error', error => {
                        if(errorCb) {
                            errorCb(error)
                        } else {
                            console.error(error)
                        }
                    })
                })
            } catch(e) {
                if(errorCb) {
                    errorCb(e)
                } else {
                    console.error(e)
                }
            }
        } else {
            try {
                this._stream = request
                .post(url)
                .form(spoutConf)
            } catch(e) {
                if(errorCb) {
                    errorCb(e)
                } else {
                    console.error(e)
                }
            }

            this._stream
            .pipe(JSONStream.parse())
            .on('data', data => {
                this._dataCb(data)
            })
            .on('error', error => {
                if(errorCb) {
                    errorCb(error)
                } else {
                    console.error(error)
                }
            })
        }
    }

    shutdown() {
        if(this._stream) {
            try {
                this._stream.abort()
            } catch(e) {
                console.error(e)
            }
            this._stream = null
        }
    }
}

module.exports = Spout