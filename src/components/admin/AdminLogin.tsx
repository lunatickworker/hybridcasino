import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ButtonLoading } from "../common/LoadingSpinner";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../contexts/LanguageContext";
import { toast } from "sonner@2.0.3";
import { Shield } from "lucide-react";
import { ImageWithFallback } from "../figma/ImageWithFallback";

interface AdminLoginProps {
  onLoginSuccess: () => void;
}

export function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { t, language, setLanguage } = useLanguage();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      toast.error(t.error.validation);
      return;
    }

    setLoading(true);
    try {
      const result = await login(username.trim(), password);
      
      if (result.success) {
        toast.success(t.login.loginSuccess);
        onLoginSuccess();
      } else {
        toast.error(result.error || t.login.loginFailed);
      }
    } catch (error) {
      toast.error(t.login.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* 언어 선택 버튼 - 우측 상단 */}
      <div className="fixed top-6 right-6 z-50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const newLang = language === 'ko' ? 'en' : 'ko';
            setLanguage(newLang);
            toast.success(
              newLang === 'ko' 
                ? '한국어로 변경되었습니다' 
                : 'Language changed to English'
            );
          }}
          className="flex items-center gap-2 hover:bg-slate-700/50 transition-all hover:scale-105 p-2 bg-slate-800/80 backdrop-blur-sm border border-slate-700/50"
          title={language === 'ko' ? 'Switch to English' : '한국어로 변경'}
        >
          <ImageWithFallback
            src={
              language === 'ko' 
                ? 'https://nzuzzmaiuybzyndptaba.supabase.co/storage/v1/object/public/images/icons8-south-korea-100.png'
                : 'https://nzuzzmaiuybzyndptaba.supabase.co/storage/v1/object/public/images/icons8-usa-100.png'
            }
            alt={language === 'ko' ? 'Korean flag' : 'USA flag'}
            className="w-10 h-10 rounded-md object-cover shadow-lg"
          />
        </Button>
      </div>

      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700 shadow-2xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <Shield className="h-12 w-12 text-blue-400" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">GMS {t.header.admin}</CardTitle>
          <CardDescription className="text-slate-400">
            {t.login.title}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-white">{t.login.title}</h3>
              <p className="text-sm text-slate-400">{t.common.username} {t.common.password}</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-white">{t.common.username}</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t.common.username}
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-white">{t.common.password}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.common.password}
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                  disabled={loading}
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-slate-700 hover:bg-slate-600"
              >
                {loading ? (
                  <ButtonLoading>{t.login.login}</ButtonLoading>
                ) : (
                  t.login.login
                )}
              </Button>
            </form>
          </div>
        </CardContent>
        
        {/* 시스템 정보 */}
        <div className="px-6 pb-6 text-center text-xs text-slate-500 space-y-1">
          <p>GMS v1.0 | {t.systemSettings.title}</p>
          <p>7-tier Authority System | Real-time Data Sync</p>
        </div>
      </Card>
    </div>
  );
}

// Default export 추가
export default AdminLogin;