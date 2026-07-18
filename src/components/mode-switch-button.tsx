import { forwardRef } from 'react';
import { Stethoscope, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface ModeSwitchButtonProps {
  currentMode: 'admin' | 'doctor';
  role?: 'doctor' | 'staff' | 'patient';
  isClinicAdmin?: boolean;
  size?: 'nav' | 'page';
  onSwitch?: (targetMode: 'admin' | 'doctor') => void;
  className?: string;
}

const ModeSwitchButton = forwardRef<HTMLButtonElement, ModeSwitchButtonProps>(
  ({ currentMode, role = 'doctor', isClinicAdmin = false, size = 'nav', onSwitch, className }, ref) => {
    if (!(isClinicAdmin === true && role === 'doctor')) {
      return null;
    }

    const isAdminMode = currentMode === 'admin';
    const label = isAdminMode ? 'Switch to Doctor Dashboard' : 'Switch to Admin Dashboard';
    const Icon = isAdminMode ? Stethoscope : ClipboardList;
    const targetMode = isAdminMode ? 'doctor' : 'admin';

    const handleClick = () => {
      onSwitch?.(targetMode);
    };

    const sizeClasses = {
      nav: 'h-9 px-3 text-sm',
      page: 'h-12 text-base w-full sm:w-auto sm:min-w-[280px]',
    };

    const buttonClasses = cn(
      sizeClasses[size],
      'border-primary/40 text-primary hover:bg-primary/10 hover:text-primary',
      className
    );

    if (size === 'nav') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button ref={ref} variant="outline" size="sm" onClick={handleClick} className={buttonClasses} aria-label={label}>
                <Icon className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {label}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <Button ref={ref} variant="outline" onClick={handleClick} className={buttonClasses} aria-label={label}>
        <Icon className="mr-2 h-5 w-5" aria-hidden="true" />
        {label}
      </Button>
    );
  }
);

ModeSwitchButton.displayName = 'ModeSwitchButton';

export default ModeSwitchButton;