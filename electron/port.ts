import net from 'node:net'

export function reservePort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, host, () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') return reject(new Error('No port'))
      const port = addr.port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

export async function isPortBindable(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, host, () => {
      server.close(() => resolve(true))
    })
  })
}
