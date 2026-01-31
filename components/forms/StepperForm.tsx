'use client';

import { useEffect, useState, ReactNode } from 'react';
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
  completedStepIds?: string[]; // Optional: restrict step jumping to only these completed step IDs (for new listings)
  onSave?: () => void | Promise<void>; // Optional save handler for any step (uses parent's formData)
  saving?: boolean; // Loading state for save operation
  showSaveButton?: boolean; // Whether to show save button on each step
  showSavingBar?: boolean; // Whether to show the subtle bottom loading bar on final submit
  completeButtonDataTour?: string; // Optional data-tour selector for the final action button
  completeButtonLabel?: string; // Optional label for the final action button (defaults to Publish Listing)
  onValidationError?: (stepId: string) => void; // Optional callback for highlighting invalid fields in the parent UI
  suppressValidationToast?: boolean; // If true, StepperForm won't show its own validation toast (caller handles UX)
  activeStepId?: string | null; // Optional external step control (jump to a step by id)
  onStepChange?: (stepId: string) => void; // Optional callback when step changes
  attentionStepIds?: string[]; // Optional: steps to visually highlight (e.g. missing fields on publish)
}

export function StepperForm({
  steps,
  onComplete,
  className,
  showProgress = true,
  allowStepJump = false,
  completedStepIds = [],
  onSave,
  saving = false,
  showSaveButton = false,
  showSavingBar = true,
  completeButtonDataTour,
  completeButtonLabel,
  onValidationError,
  suppressValidationToast = false,
  activeStepId = null,
  onStepChange,
  attentionStepIds = [],
}: StepperFormProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;
  const attention = new Set(attentionStepIds || []);

  const scrollToTop = () => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Allow parent to request a step jump (e.g. publish validation failure -> jump to the step with missing fields).
  useEffect(() => {
    if (!activeStepId) return;
    const idx = steps.findIndex((s) => s.id === activeStepId);
    if (idx >= 0 && idx !== currentStep) {
      setCurrentStep(idx);
      scrollToTop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStepId, steps]);

  useEffect(() => {
    onStepChange?.(currentStepData?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  const handleNext = () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'StepperForm.tsx:handleNext:entry',
        message: 'handleNext called',
        data: { saving, isLastStep, currentStepId: currentStepData?.id },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        hypothesisId: 'H3',
      }),
    }).catch(() => {});
    // #endregion
    // Prevent double-submits / double-advances while parent is saving/submitting.
    if (saving) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'StepperForm.tsx:handleNext:earlyReturnSaving',
          message: 'early return: saving true',
          data: {},
          timestamp: Date.now(),
          sessionId: 'debug-session',
          hypothesisId: 'H4',
        }),
      }).catch(() => {});
      // #endregion
      return;
    }
    // Validate current step if validator exists
    const valid = !currentStepData.validate || currentStepData.validate();
    // #region agent log
    if (isLastStep) {
      fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'StepperForm.tsx:handleNext:lastStep',
          message: 'last step: validate and onComplete',
          data: { valid, callingOnComplete: valid },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          hypothesisId: 'H3',
        }),
      }).catch(() => {});
    }
    // #endregion
    if (!valid) {
      const errorMsg = currentStepData.errorMessage || 'Please complete all required fields before continuing.';
      onValidationError?.(currentStepData.id);
      if (!suppressValidationToast) {
        toast.error('Validation Error', {
          description: errorMsg,
        });
      }
      return;
    }

    if (isLastStep) {
      onComplete(formData);
    } else {
      setCurrentStep(currentStep + 1);
      scrollToTop();
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
      scrollToTop();
    }
  };

  const handleStepClick = (index: number) => {
    if (!allowStepJump) return;
    if (index === currentStep) return;
    
    // If completedStepIds is provided, only allow jumping to completed steps or the current step
    if (completedStepIds.length > 0) {
      const stepId = steps[index].id;
      const isCompleted = completedStepIds.includes(stepId);
      const isCurrentOrBefore = index <= currentStep;
      
      // Allow clicking on: completed steps, current step, or any step before current
      if (!isCompleted && !isCurrentOrBefore) {
        return; // Don't allow jumping to uncompleted future steps
      }
    }
    
    setCurrentStep(index);
    scrollToTop();
  };

  return (
    <div className={cn('space-y-4 sm:space-y-6', className)}>
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
            {steps.map((step, index) => {
              // Determine if this step is clickable
              const isClickable = allowStepJump && (() => {
                if (completedStepIds.length === 0) return true; // All steps clickable if no restrictions
                const isCompleted = completedStepIds.includes(step.id);
                const isCurrentOrBefore = index <= currentStep;
                return isCompleted || isCurrentOrBefore;
              })();
              
              return (
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
                      attention.has(step.id) && index !== currentStep
                        ? 'ring-4 ring-destructive/20 border border-destructive text-destructive bg-destructive/10'
                        : null,
                      isClickable
                        ? 'cursor-pointer hover:scale-110 hover:ring-2 hover:ring-primary/30'
                        : 'cursor-not-allowed opacity-50'
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
                      attention.has(step.id) && index !== currentStep ? 'font-semibold text-destructive' : null,
                      isClickable
                        ? 'cursor-pointer hover:text-foreground transition-colors'
                        : 'cursor-not-allowed opacity-50'
                    )}
                  >
                    {step.title}
                  </span>
                </div>
              );
            })}
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
      <div className="min-h-[300px] sm:min-h-[400px] py-4 sm:py-6">
        {currentStepData.content}
      </div>

      {/* Enhanced Navigation */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 pt-6 pb-6 sm:pb-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={handlePrevious}
          disabled={isFirstStep || saving}
          className="min-h-[48px] w-full sm:w-auto sm:min-w-[120px] order-2 sm:order-1"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>

        <div className="flex items-center gap-3 w-full sm:w-auto order-1 sm:order-2">
          {showSaveButton && onSave && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onSave()}
              disabled={saving}
              className="min-h-[48px] flex-1 sm:flex-none sm:min-w-[140px] font-semibold"
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
              "min-h-[48px] flex-1 sm:flex-none sm:min-w-[150px] font-semibold shadow-lg hover:shadow-xl transition-shadow",
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
