import { useContext } from 'react'
import { SocketContext } from '../context/SocketContext'

export function useSocket () {
  const v = useContext(SocketContext)
  return v?.socket
}

export function useSocketAuth () {
  const v = useContext(SocketContext)
  return v?.ensureSocketAuth
}
