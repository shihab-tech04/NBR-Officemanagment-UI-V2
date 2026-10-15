import { AppButton, type AppButtonProps } from "./AppButton";

// Public compatibility adapter: retain the existing props and approved styling.
type DangerButtonProps = Omit<AppButtonProps, "variant">;

export function DangerButton(props: DangerButtonProps) {
  return <AppButton {...props} variant="danger" />;
}
