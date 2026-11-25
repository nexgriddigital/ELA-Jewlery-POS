import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ELA POS ErrorBoundary caught error:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#E8DFD3] rounded-xl p-8 text-center">
            <img
              src="/assets/aistudio/image_89dfb75c.png"
              alt="ELA Jewelry"
              className="h-20 mx-auto mb-5 object-contain"
              referrerPolicy="no-referrer"
            />
            <h1 className="font-display text-2xl font-semibold text-[#231712] mb-2">
              Workspace Sync Interruption
            </h1>
            <p className="text-sm text-[#766257] mb-5 leading-relaxed">
              The register encountered an unexpected error. Your saved records remain protected.
            </p>
            <div className="bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg p-3 text-left text-xs font-mono text-[#BE1A1A] break-words mb-6 max-h-36 overflow-auto">
              {this.state.message}
            </div>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="px-5 py-2.5 bg-[#BE1A1A] hover:bg-[#D0311E] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Reload Register
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
