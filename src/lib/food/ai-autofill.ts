// ---------------------------------------------------------------------------
// V2 STUB: AI Package Image Autofill
// ---------------------------------------------------------------------------

export interface AIAutofillResult {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

/**
 * V2 Feature Stub: Analyzes a base64 package image using an AI endpoint
 * to automatically extract nutritional information and product name.
 */
export async function autofillFromPackageImage(
  imageBase64: string
): Promise<AIAutofillResult> {
  console.info(
    "[V2 STUB] autofillFromPackageImage called with image size:",
    imageBase64.length
  );

  // Simulate network delay for AI processing
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Return mock data
  return {
    name: "AI Guessed Product (Stub)",
    calories: 250,
    protein: 15,
    fat: 8,
    carbs: 30,
  };
}
