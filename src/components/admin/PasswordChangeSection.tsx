import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent } from "../ui/card";
import { Settings } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import { useLanguage } from "../../contexts/LanguageContext";

interface PasswordChangeSectionProps {
  userId: string;
}

export function PasswordChangeSection({ userId }: PasswordChangeSectionProps) {
  const { t } = useLanguage();
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const changePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error(t.passwordChange.enterPassword);
      return;
    }

    if (newPassword.length < 4) {
      toast.error(t.passwordChange.minLength);
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t.passwordChange.passwordMismatch);
      return;
    }

    try {
      setPasswordLoading(true);

      // users 테이블의 password_hash 업데이트 (평문 저장)
      const { data, error: updateError } = await supabase
        .from('users')
        .update({
          password_hash: newPassword,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select();

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }

      console.log('Password update result:', data);
      toast.success(t.passwordChange.changeSuccess);
      setNewPassword('');
      setConfirmPassword('');

    } catch (error: any) {
      console.error('Password change error:', error);
      toast.error(error.message || t.passwordChange.changeFailed);
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div>
      <h3 className="flex items-center gap-2 mb-3">
        <Settings className="h-3.5 w-3.5 text-red-400" />
        <span className="text-xs">{t.passwordChange.title}</span>
      </h3>
      <Card className="bg-white/5 border-white/10">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-xs">{t.passwordChange.newPassword}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t.passwordChange.newPasswordPlaceholder}
                className="bg-white/5 border-white/10 text-xs h-9"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-xs">{t.passwordChange.confirmPassword}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t.passwordChange.confirmPasswordPlaceholder}
                className="bg-white/5 border-white/10 text-xs h-9"
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button
              onClick={changePassword}
              disabled={passwordLoading || !newPassword || !confirmPassword}
              className="bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white px-4 py-2 text-xs h-9"
            >
              {passwordLoading ? t.passwordChange.changing : t.passwordChange.changeButton}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}