import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = [
  spawn(npmCommand, ['run', 'dev:auth'], { stdio: 'inherit', shell: process.platform === 'win32' }),
  spawn(npmCommand, ['run', 'dev'], { stdio: 'inherit', shell: process.platform === 'win32' }),
]

function stopChildren() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
}

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) process.exitCode = code
  })
}

process.on('SIGINT', () => {
  stopChildren()
  process.exit(0)
})
process.on('SIGTERM', () => {
  stopChildren()
  process.exit(0)
})

