import { MongoClient } from "https://deno.land/x/mongo@v0.22.0/mod.ts"
import { serve, ServerRequest } from "https://deno.land/std@0.90.0/http/server.ts"
import "https://deno.land/x/dotenv/load.ts"

const decoder = new TextDecoder()
const client = new MongoClient()

const host = Deno.env.get("MONGO_HOST")
if (!host) {
    throw Error("MONGO_HOST not defined!")
}

const db = await client.connect({
    db: "mini",
    tls: true,
    servers: [{
        host,
        port: 27017,
    }],
    credential: {
        username: Deno.env.get("MONGO_USER"),
        password: Deno.env.get("MONGO_PASS"),
        db: "mini",
        mechanism: "SCRAM-SHA-1",
    }
})

interface RedirectSchema {
    _id: { $oid: string }
    short: string
    long: string
    hits: number
    createdAt: Date
}

const redirs = db.collection<RedirectSchema>("redirects")

console.log(db)
redirs.insert({
    short: "me",
    long: "https://benjic.xyz",
    hits: 0,
    createdAt: new Date()
})

// Server
const port = `:${Deno.env.get("PORT") || 8080}`
const server = serve(port)

console.log(`Live on ${port}`)

for await (const req of server) {
    if (req.url === "/" || req.url === '') {
        if (await handleRoot(req)) continue
    }

    if (req.url === "/styles.css") {
        sendFile(req, "src/styles.css", "text/css")
        continue
    }

    if (/^\/[a-zA-Z0-9\-\_]+(?:\/)?$/.test(req.url)) {
        const key = req.url.slice(1).endsWith("/")
            ? req.url.slice(1, -1)
            : req.url.slice(1)
        // @ts-expect-error -- https://github.com/denodrivers/deno_mongo/issues/179
        const redir = await redirs.findOne({ short: key }, { noCursorTimeout: false })
        console.log(req.url, key)
        if (redir) {
            req.respond({
                headers: new Headers({
                    "location": redir.long,
                }),
                status: 307,
            })
            continue
        }
    }
    sendFile(req, "src/404.html")
}

async function handleRoot(req: ServerRequest): Promise<boolean> {
    switch (req.method.toLowerCase()) {
        case "post":
            console.log(decoder.decode(await Deno.readAll(req.body)))
            return false
        case "get":
            await sendFile(req, "src/index.html")
            return true
    }

    return false
}

async function sendFile(req: ServerRequest, path: string, contentType = 'text/html') {
    req.respond({
        headers: new Headers({
            "content-type": `${contentType}; charset=utf-8`
        }),
        body: await Deno.readFile(path)
    })
}
