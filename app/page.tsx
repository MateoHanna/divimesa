import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Badge variant="secondary">Demo</Badge>
          <CardTitle className="text-xl">Pague su cuenta con QR</CardTitle>
          <CardDescription>El proyecto está en construcción.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Fase 0 lista: el servidor responde en <code className="font-mono">/api/health</code>.
        </CardContent>
      </Card>
    </main>
  );
}
