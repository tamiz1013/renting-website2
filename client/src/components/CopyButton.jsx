import toast from 'react-hot-toast';

export function CopyButton({ text, label = 'Copy' }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied!');
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <button className="copy-btn" onClick={handleCopy} type="button">
      {label}
    </button>
  );
}
