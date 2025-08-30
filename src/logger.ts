import { color } from './utils';

export function logStep(msg: string) {
  console.log(color.bold(color.cyan(`→ ${ msg }`)));
}

export function logInfo(msg: string) {
  console.log(color.cyan(msg));
}

export function logWarn(msg: string) {
  console.log(color.yellow(msg));
}

export function logOk(msg: string) {
  console.log(color.green(msg));
}

export function logErr(msg: string) {
  console.error(color.red(msg));
}
