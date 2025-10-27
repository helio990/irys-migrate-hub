import * as React from 'react';
import { X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface ErrorOverlayProps {
  error: {
    message: string;
    stack?: string;
    file?: string;
    line?: number;
    column?: number;
  };
  onClose: () => void;
}

export function ErrorOverlay({ error, onClose }: ErrorOverlayProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-4 z-50 max-w-md mx-auto my-20 rounded-lg border bg-background p-6 shadow-lg">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <h2 className="text-lg font-semibold">Something went wrong</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-muted-foreground">
            The app encountered an issue while updating.
          </p>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showDetails ? 'Hide' : 'Show'} technical details
          </button>

          {showDetails && (
            <div className="space-y-3 pt-2 border-t">
              {error.file && (
                <div className="text-sm">
                  <span className="font-medium">File:</span> {error.file}
                  {error.line && (
                    <span className="text-muted-foreground">
                      :{error.line}
                      {error.column && `:${error.column}`}
                    </span>
                  )}
                </div>
              )}

              <div>
                <h3 className="mb-2 font-medium text-sm">Error Message:</h3>
                <div className="rounded-md bg-muted p-3 font-mono text-xs">
                  {error.message}
                </div>
              </div>

              {error.stack && (
                <div>
                  <h3 className="mb-2 font-medium text-sm">Stack Trace:</h3>
                  <div className="max-h-32 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
                    <pre className="whitespace-pre-wrap">{error.stack}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
