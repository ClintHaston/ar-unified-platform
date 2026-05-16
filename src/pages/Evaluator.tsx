import { ToolFrame } from './ToolFrame'
import { TOOL_URLS } from '../lib/config'

export function Evaluator() {
  return <ToolFrame src={TOOL_URLS.evaluator} title="Asset-Resource Evaluator" />
}
