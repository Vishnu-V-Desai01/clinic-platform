import React from 'react';
import { CheckCircle2, ClipboardList, Stethoscope } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface FirstLoginWelcomeProps {
  doctorName?: string;
  onGoToAdmin?: () => void;
  onGoToDoctor?: () => void;
}

export default function FirstLoginWelcome({
  doctorName = 'Dr. Rajen Mehta',
  onGoToAdmin = () => {},
  onGoToDoctor = () => {},
}: FirstLoginWelcomeProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="border border-border bg-card rounded-xl shadow-sm p-8 max-w-md w-full flex flex-col items-center space-y-6">
        <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="size-6 text-primary" aria-hidden="true" />
        </div>

        <h1 className="text-2xl font-semibold text-foreground text-center">
          Welcome to your clinic, <br />
          {doctorName}
        </h1>

        <p className="text-sm text-muted-foreground leading-relaxed text-center">
          You&apos;re now both the doctor and administrator for your clinic. You can switch between doctor mode (manage patients, write records) and admin mode (manage staff, view clinic metrics) anytime from the nav bar.
        </p>

        <div className="flex flex-col gap-3 w-full pt-2">
          <Button onClick={onGoToAdmin} className="w-full" size="lg">
            <ClipboardList className="mr-2 size-4" aria-hidden="true" />
            Go to Admin Dashboard
          </Button>
          <Button onClick={onGoToDoctor} variant="outline" className="w-full" size="lg">
            <Stethoscope className="mr-2 size-4" aria-hidden="true" />
            Go to Doctor Dashboard
          </Button>
        </div>
      </Card>
    </div>
  );
}