'use client';

import { useState, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface Step {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
  validate?: () => boolean;
  errorMessage?: string;
}

interface StepperFormProps {
  steps: Step[];
  onComplete: (data: Record<string, unknown>) => void;
  className?: string;
  showProgress?: boolean;
}

export function StepperForm({
  steps,
  onComplete,
  className,
  showProgress = true,
}: StepperFormProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    // Validate current step if validator exists
    if (currentStepData.validate && !currentStepData.validate()) {
      const errorMsg = currentStepData.errorMessage || 'Please complete all required fields before continuing.';
      toast.error('Validation Error', {
        description: errorMsg,
      });
      return;
    }

    if (isLastStep) {
      onComplete(formData);
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Progress Bar */}
      {showProgress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-muted-foreground">
              {Math.round(progress)}%
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {/* Step Header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold">{currentStepData.title}</h2>
        {currentStepData.description && (
          <p className="text-muted-foreground">{currentStepData.description}</p>
        )}
      </div>

      {/* Step Content */}
      <div className="min-h-[300px] py-4">
        {currentStepData.content}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-4 pt-6 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={handlePrevious}
          disabled={isFirstStep}
          className="min-h-[48px] min-w-[120px]"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>

        <Button
          type="button"
          onClick={handleNext}
          className="min-h-[48px] min-w-[120px]"
        >
          {isLastStep ? 'Complete' : 'Next'}
          {!isLastStep && <ChevronRight className="h-4 w-4 ml-2" />}
        </Button>
      </div>
    </div>
  );
}
