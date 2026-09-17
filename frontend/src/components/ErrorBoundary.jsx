import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const label = this.props.label || '이 섹션';
      return (
        <div className="p-4 border-2 border-red-200 dark:border-red-800 rounded-xl bg-red-50 dark:bg-red-900/20">
          <p className="text-sm font-bold text-red-600 dark:text-red-400">
            {label}을(를) 표시하는 중 오류가 발생했습니다.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 text-xs font-bold text-red-500 hover:underline"
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
