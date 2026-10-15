import { AppButton, type AppButtonProps } from "./AppButton";

// Public compatibility adapter: retain the existing props and approved styling.
type SecondaryButtonProps = Omit<AppButtonProps, "variant">;

export function SecondaryButton(props: SecondaryButtonProps) {
  return <AppButton {...props} variant="secondary" />;
}
