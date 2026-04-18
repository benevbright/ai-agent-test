export function getReasoningDeltaFromRawChunk(
  rawValue: unknown,
): string | undefined {
  if (!rawValue || typeof rawValue !== "object") {
    return undefined
  }

  const chunk = rawValue as {
    choices?: Array<{
      delta?: {
        reasoning_content?: string
        reasoning?: string
        reasoning_text?: string
      }
    }>
  }

  const delta = chunk.choices?.[0]?.delta
  if (!delta) {
    return undefined
  }

  return (
    delta.reasoning_content ??
    delta.reasoning ??
    delta.reasoning_text ??
    undefined
  )
}

export let contextLength: number = 0 // 0 means not yet fetched

// Fetch context length from models API if available (only once)
export async function fetchContextLength({
  baseUrl,
  apiKey,
  modelName,
}: {
  baseUrl: string
  apiKey: string
  modelName: string
}): Promise<number> {
  // Only fetch if we still have the default value
  if (contextLength !== 0) {
    return contextLength
  }
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
    const data = await response.json()

    // Try to find the model in different possible response formats
    const modelsArray = data.data || data
    const modelData = modelsArray.find((m: any) => m.id === modelName)

    if (modelData) {
      // Check for context_length in various locations
      contextLength = modelData.context_length || 0
      return contextLength
    }
  } catch {
    // Fail silently - use default fallback
  }
  return contextLength // return 0 if not found
}
