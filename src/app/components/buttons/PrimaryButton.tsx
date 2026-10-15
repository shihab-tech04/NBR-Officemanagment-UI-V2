import { AppButton, type AppButtonProps } from "./AppButton";

// Public compatibility adapter: retain the existing props and approved styling.
type PrimaryButtonProps = Omit<AppButtonProps, "variant">;

export function PrimaryButton(props: PrimaryButtonProps) {
  return <AppButton {...props} variant="primary" />;
}
