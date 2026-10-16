import { browser } from 'wxt/browser'

import type { ApiRequest, ApiResponse } from '../types/bilibili'

export async function callApi<T>(message: ApiRequest): Promise<T> {
  const response = await browser.runtime.sendMessage(message) as ApiResponse<T>
  if (!response.ok)
    throw new Error(response.error || 'BiliYouTube API request failed')
  return response.data as T
}
