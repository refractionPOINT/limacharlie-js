const CryptoJS = require("crypto-js")

class Webhook {
    constructor(secretKey) {
        this._secretKey = secretKey
    }

    isSignatureValid(dataFromHook, signature) {
        let hash = CryptoJS.HmacSHA256(dataFromHook, this._secretKey);
        hash = CryptoJS.enc.Hex.stringify(hash)
        return signature === hash
    }
}

module.exports = Webhook
