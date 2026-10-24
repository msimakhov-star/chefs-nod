// The 14 allergens UK food law requires businesses to declare.
// Source: https://www.food.gov.uk/business-guidance/allergen-guidance-for-food-businesses
export const ALLERGENS = [
  { id: "celery", label: "Celery" },
  { id: "gluten", label: "Cereals containing gluten" },
  { id: "crustaceans", label: "Crustaceans" },
  { id: "eggs", label: "Eggs" },
  { id: "fish", label: "Fish" },
  { id: "lupin", label: "Lupin" },
  { id: "milk", label: "Milk" },
  { id: "molluscs", label: "Molluscs" },
  { id: "mustard", label: "Mustard" },
  { id: "nuts", label: "Tree nuts" },
  { id: "peanuts", label: "Peanuts" },
  { id: "sesame", label: "Sesame" },
  { id: "soya", label: "Soya" },
  { id: "sulphites", label: "Sulphur dioxide and sulphites" },
] as const;

export type AllergenId = (typeof ALLERGENS)[number]["id"];
export const ALLERGEN_IDS = ALLERGENS.map((a) => a.id) as AllergenId[];

export function allergenLabel(id: string) {
  return ALLERGENS.find((a) => a.id === id)?.label ?? id;
}
