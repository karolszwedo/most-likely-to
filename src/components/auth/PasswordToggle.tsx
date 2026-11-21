import { Eye, EyeOff } from "lucide-react";
import { InputGroupButton } from "@/components/ui/input-group";
import { useT } from "@/lib/i18n/react";

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
}

export function PasswordToggle({ visible, onToggle }: PasswordToggleProps) {
  const t = useT();
  return (
    <InputGroupButton
      size="icon-xs"
      onClick={onToggle}
      aria-label={visible ? t.auth.form.hidePassword : t.auth.form.showPassword}
    >
      {visible ? <EyeOff /> : <Eye />}
    </InputGroupButton>
  );
}
