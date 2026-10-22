import type { LaunchState, Phase } from './types';

export const initialState = (attempt = ''): LaunchState => ({ phase: 'ready', message: 'Ready to launch.', attempt });
export function beginLaunch(attempt: string, logFile: string): LaunchState {
  return { phase: 'checking', message: 'Validating instance...', attempt, logFile };
}
// Every asynchronous event belongs to an attempt. Late output from an old process
// cannot change the current launch, and terminal text cannot be replaced by logs.
export function latestLog(state: LaunchState, attempt: string, message: string): LaunchState {
  if (state.attempt !== attempt || !['checking', 'downloading', 'starting'].includes(state.phase)) return state;
  const line = message.replace(/\x1b\[[0-9;]*m/g, '').trim();
  return line ? { ...state, message: line.slice(-800) } : state;
}
export function transition(state: LaunchState, attempt: string, phase: Phase, error?: string): LaunchState {
  if (state.attempt !== attempt) return state;
  if (state.phase === 'failed' || (state.phase === 'running' && !['ready', 'failed'].includes(phase))) return state;
  const message = phase === 'running' ? 'Instance is Running.' : phase === 'failed' ? 'Launch Failed.' : phase === 'ready' ? 'Ready to launch.' : state.message;
  return { ...state, phase, message, error, progress: undefined };
}
