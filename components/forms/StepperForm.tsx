'use client';

import { useState, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight, Save, Loader2 } from 'lucide-react';
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
  allowStepJump?: boolean; // Allow clicking on any step to jump to it
  onSave?: () => void | Promise<void>; // Optional save handler for any step (uses parent's formData)
  saving?: boolean; // Loading state for save operation
  showSaveButton?: boolean; // Whether to show save button on each step
  showSavingBar?: boolean; // Whether to show the subtle bottom loading bar on final submit
  completeButtonDataTour?: string; // Optional data-tour selector for the final action button
  completeButtonLabel?: string; // Optional label for the final action button (defaults to Publish Listing)
  onValidationError?: (stepId: string) => void; // Optional callback for highlighting invalid fields in the parent UI
}

export function StepperForm({
  steps,
  onComplete,
  className,
  showProgress = true,
  allowStepJump = false,
  onSave,
  saving = false,
  showSaveButton = false,
  showSavingBar = true,
  completeButtonDataTour,
  completeButtonLabel,
  onValidationError,
}: StepperFormProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    // Prevent double-submits / double-advances while parent is saving/submitting.
    if (saving) return;
    // Validate current step if validator exists
    if (currentStepData.validate && !currentStepData.validate()) {
      const errorMsg = currentStepData.errorMessage || 'Please complete all required fields before continuing.';
      onValidationError?.(currentStepData.id);
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

  const handleStepClick = (index: number) => {
    if (allowStepJump && index !== currentStep) {
      setCurrentStep(index);
    }
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Enhanced Progress Bar */}
      {showProgress && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-muted-foreground font-medium">
              {Math.round(progress)}% Complete
            </span>
          </div>
          <Progress value={progress} className="h-3" />
          
          {/* Step Indicators */}
          <div className="flex items-center justify-between pt-2">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  'flex flex-col items-center flex-1',
                  index < steps.length - 1 && 'pr-2'
                )}
              >
                <div
                  onClick={() => handleStepClick(index)}
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                    index < currentStep
                      ? 'bg-primary text-primary-foreground'
                      : index === currentStep
                      ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                      : 'bg-muted text-muted-foreground',
                    allowStepJump && 'cursor-pointer hover:scale-110 hover:ring-2 hover:ring-primary/30'
                  )}
                >
                  {index < currentStep ? '✓' : index + 1}
                </div>
                <span
                  onClick={() => handleStepClick(index)}
                  className={cn(
                    'text-xs mt-1 text-center hidden sm:block truncate max-w-[80px]',
                    index === currentStep
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground',
                    allowStepJump && 'cursor-pointer hover:text-foreground transition-colors'
                  )}
                >
                  {step.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enhanced Step Header */}
      <div className="space-y-2 pb-4 border-b">
        <h2 className="text-2xl md:text-3xl font-extrabold text-foreground">
          {currentStepData.title}
        </h2>
        {currentStepData.description && (
          <p className="text-muted-foreground text-base">
            {currentStepData.description}
          </p>
        )}
      </div>

      {/* Step Content with Better Spacing */}
      <div className="min-h-[400px] py-6">
        {currentStepData.content}
      </div>

      {/* Enhanced Navigation */}
      <div className="flex items-center justify-between gap-4 pt-6 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={handlePrevious}
          disabled={isFirstStep || saving}
          className="min-h-[48px] min-w-[120px]"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>

        <div className="flex items-center gap-3">
          {showSaveButton && onSave && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onSave()}
              disabled={saving}
              className="min-h-[48px] min-w-[140px] font-semibold"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          )}

          <Button
            type="button"
            onClick={handleNext}
            disabled={saving}
            {...(isLastStep && completeButtonDataTour ? { 'data-tour': completeButtonDataTour } : {})}
            className={cn(
              "min-h-[48px] min-w-[150px] font-semibold shadow-lg hover:shadow-xl transition-shadow",
              isLastStep && "bg-gradient-to-r from-primary to-primary/90"
            )}
          >
            {isLastStep ? (
              <>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Publishing…
                  </>
                ) : (
                  completeButtonLabel || 'Publish Listing'
                )}
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Action feedback: subtle loading bar so users don’t click twice */}
      {showSavingBar && saving && isLastStep ? (
        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full w-1/3 bg-primary animate-pulse" />
        </div>
      ) : null}
    </div>
  );
}
