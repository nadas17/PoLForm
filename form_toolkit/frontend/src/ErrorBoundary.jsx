import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary yakaladı:", error, errorInfo);
  }

  handleReset = () => {
    try {
      sessionStorage.clear();
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-zinc-950 px-4">
          <div className="max-w-md w-full glass-elevated rounded-xl p-6 text-center">
            <div aria-hidden="true"
                 className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/15 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                   className="w-6 h-6 text-red-400">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-zinc-50 mb-2">
              Beklenmeyen bir hata oluştu
            </h1>
            <p className="text-sm text-zinc-400 mb-5 leading-relaxed">
              Uygulama yanıt veremedi. Sayfayı yenilemeyi deneyebilir veya
              tüm verileri sıfırlayıp baştan başlayabilirsiniz.
            </p>
            {this.state.error?.message && (
              <pre className="text-[11px] font-mono text-zinc-500 bg-zinc-950 border border-white/[0.06]
                              rounded p-2 mb-4 text-left overflow-auto max-h-24">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-medium
                           hover:bg-emerald-400 transition-colors focus-ring"
              >
                Sayfayı yenile
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="text-zinc-300 border border-white/10 px-5 py-2 rounded-lg text-sm font-medium
                           hover:bg-white/[0.06] transition-colors focus-ring"
              >
                Verileri sıfırla
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
