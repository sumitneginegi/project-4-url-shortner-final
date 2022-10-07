const UrlModel = require("../models/urlModel")
const shortid = require('shortid')
let validUrl = require('valid-url');
const redis = require("redis");
const { promisify } = require("util");

//Connect to redis

const redisClient = redis.createClient(
    17158,
    "redis-17158.c17.us-east-1-4.ec2.cloud.redislabs.com",
    { no_ready_check: true }
);
redisClient.auth("f5sWRo37SPYE7xcFLP4XZF3yIKX5UhJV", function (err) {
    if (err) throw err;
});

redisClient.on("connect", async function () {
    console.log("Connected to Redis..");
});

//Connection setup for redis

const SETEX_ASYNC = promisify(redisClient.SETEX).bind(redisClient);
const GET_ASYNC = promisify(redisClient.GET).bind(redisClient);
const SET_ASYNC = promisify(redisClient.SET).bind(redisClient)

const isValidAdd = function (value) {
    if (typeof value == "undefined" || value === null || typeof value === "boolean" || typeof value === "number") return false
    if (typeof value == "string" && value.trim().length == 0) return false
    return true
}

const creatUrl = async function (req, res) {
    try {
        let { longUrl } = req.body

        if (!(isValidAdd(longUrl))) return res.status(400).send({ status: false, message: "please provide data in body" })
        if (!longUrl) return res.status(400).send({ status: false, message: "please input longUrl is mandatory" })
        if (!validUrl.isUri(longUrl)) return res.status(400).send({ status: false, message: "invalid long URL" })
        
        let casheData = await GET_ASYNC(`${longUrl}`);
        if (casheData) return res.status(200).send({ status: false, msg: " data from cache", data: JSON.parse(casheData) })

        let url = await UrlModel.findOne({ longUrl }).select({ longUrl: 1, shortUrl: 1, urlCode: 1, _id: 0 })
        if (url) {
            await SETEX_ASYNC(`${longUrl}`, 60, JSON.stringify({ longUrl }))        // setting in cache
            return res.status(200).send({ status: true, msg: "Data from db", data: url })
        }

        const urlCode = shortid.generate().toLowerCase()
        const shortUrl = `http://localhost:3000/${urlCode}`

        url = new UrlModel({ longUrl, shortUrl, urlCode })
        await url.save()
        let obj = await UrlModel.findOne({ longUrl }).select({ _id: 0, __v: 0 })
        //await SETEX_ASYNC(`${longUrl}`, 20, JSON.stringify(longUrl))  
        return res.status(201).send({ status: true, msg: "data newly created", data: obj })
    } catch (err) {
        return res.status(500).send({ status: false, message: err })
    }
}

const getUrl = async function (req, res) {
    try {
        const urlCode = req.params.urlCode;
        if (urlCode.length != 9) return res.status(400).send({status: false,message: "url code should be 9 characters only"})
        if(/.*[A-Z].*/.test(urlCode)) return res.status(400).send({ status: false, message: "please Enter urlCode only in lowercase " })
        if (!shortid.isValid(urlCode)) return res.status(400).send({status: false,message: "please enter valid url"})

        const shortUrl = await UrlModel.findOne({ urlCode:urlCode }).select({ shortUrl: 1,_id:0 })

        if( !shortUrl) return res.status(404).send({ status: false, message: "no shortUrl found" });

        let casheData = await GET_ASYNC(`${urlCode}`);
        // if(!casheData) return res.status(400).send({msg:"no data from cache"})
        if (casheData) return res.status(302).redirect(casheData);

        const findURL = await UrlModel.findOne({ urlCode: req.params.urlCode }).select({ _id: 0, __v: 0 });
        
        if (findURL) {
            await SET_ASYNC(`${req.params.urlCode}`, findURL.longUrl);
            return res.status(302).redirect(findURL.longUrl);
        }
        return res.status(404).send({ status: false, message: "url not found" })
    }
    catch (err) {
        res.status(500).send({ status: false, message: err })
    }
}


module.exports = { creatUrl, getUrl }