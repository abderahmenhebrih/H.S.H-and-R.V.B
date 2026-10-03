import { Dimensions } from "react-native";

const { width, height } = Dimensions.get("window");

export const breakpoints = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
} as const;

export function isTablet() {
  return width >= breakpoints.tablet;
}

export const screen = { width, height };
