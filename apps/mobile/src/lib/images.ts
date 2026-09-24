import type { ImageSource } from "expo-image";
import type { PropertyImageKey } from "@rentbrown/mock-data";

const SOURCES: Record<PropertyImageKey, ImageSource> = {
  "ikoyi-residences": require("../../assets/properties/ikoyi-residences.jpg"),
  "lekki-courts": require("../../assets/properties/lekki-courts.jpg"),
  "wuse-square": require("../../assets/properties/wuse-square.jpg"),
};

export function propertyImage(key: PropertyImageKey | undefined): ImageSource {
  return SOURCES[key ?? "ikoyi-residences"];
}
