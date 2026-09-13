import http from 'node:http'

const port = Number(process.env.PORT ?? 3000)

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('truco server: ok')
})

server.listen(port, () => {
  console.log(`[truco-server] escutando na porta ${port}`)
})