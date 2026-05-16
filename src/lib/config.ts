function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '')
}

export const TOOL_URLS = {
  evaluator: stripBom(import.meta.env.VITE_EVALUATOR_URL || 'https://asset-resource-production.up.railway.app'),
  deals: stripBom(import.meta.env.VITE_DEALS_URL || ''),
  leads: stripBom(import.meta.env.VITE_LEADS_URL || ''),
  sales_command: stripBom(import.meta.env.VITE_SALES_COMMAND_URL || ''),
}