import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Loader2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
// import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface ScoredTicker {
  ticker: string;
  score: number | null;
  price?: number;
  changePct?: number;
  signal?: 'buy' | 'hold' | 'sell';
}

interface ScreenshotUploaderProps {
  onSelectStock?: (ticker: string) => void;
}

export function ScreenshotUploader({ onSelectStock }: ScreenshotUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<ScoredTicker[]>([]);
  const [tickersFound, setTickersFound] = useState(0);
  const [rawText, setRawText] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      return;
    }

    setUploading(true);
    setResults([]);
    setRawText('');
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/screenshots', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'OCR failed');
        return;
      }

      setTickersFound(data.tickersFound || 0);
      setResults(data.tickers || []);
      setRawText(data.rawText || '');
      toast.success(`Found ${data.tickersFound} ticker(s)`);
    } catch (err) {
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-white/50';
    if (score >= 70) return 'text-green-500';
    if (score >= 50) return 'text-amber-500';
    return 'text-red-500';
  };

  const getScoreBg = (score: number | null) => {
    if (score === null) return 'bg-white/5';
    if (score >= 70) return 'bg-green-500/10 border-green-500/30';
    if (score >= 50) return 'bg-amber-500/10 border-amber-500/30';
    return 'bg-red-500/10 border-red-500/30';
  };

  return (
    <>
      {/* Floating trigger button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gold hover:bg-gold-light text-[#0a0a0a] shadow-lg shadow-gold/20 flex items-center justify-center transition-colors"
        title="Upload portfolio screenshot"
      >
        <Camera size={24} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#1f1f1f] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-white/10">
                <div>
                  <h3 className="text-lg font-semibold text-white">Portfolio Screenshot</h3>
                  <p className="text-white/50 text-sm">Upload a screenshot to scan & score tickers</p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/5 text-white/60 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-5">
                {/* Upload area */}
                {!results.length && (
                  <div
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                      dragActive
                        ? 'border-gold bg-gold/5'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                  >
                    <input
                      ref={inputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleChange}
                    />
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                      {uploading ? (
                        <Loader2 size={28} className="text-gold animate-spin" />
                      ) : (
                        <ImageIcon size={28} className="text-white/40" />
                      )}
                    </div>
                    <p className="text-white font-medium mb-1">
                      {uploading ? 'Scanning image...' : 'Drop screenshot here'}
                    </p>
                    <p className="text-white/40 text-sm">
                      {uploading ? 'OCR in progress' : 'or click to browse (JPG, PNG, WebP)'}
                    </p>
                  </div>
                )}

                {/* Results */}
                <AnimatePresence>
                  {results.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-4"
                    >
                      {previewUrl && (
                        <div className="rounded-lg overflow-hidden border border-white/10">
                          <img
                            src={previewUrl}
                            alt="Uploaded screenshot"
                            className="w-full max-h-48 object-contain bg-black"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <p className="text-white/70 text-sm">
                          Found <span className="text-gold font-semibold">{tickersFound}</span> ticker(s)
                        </p>
                        <button
                          onClick={() => {
                            setResults([]);
                            setTickersFound(0);
                            setRawText('');
                            if (previewUrl) {
                              URL.revokeObjectURL(previewUrl);
                              setPreviewUrl(null);
                            }
                          }}
                          className="text-sm text-white/40 hover:text-white transition-colors"
                        >
                          Upload another
                        </button>
                      </div>

                      {results.map((r, i) => (
                        <div
                          key={r.ticker}
                          className={`flex items-center justify-between p-3 rounded-lg border ${getScoreBg(r.score)}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-white/30 text-sm w-4">{i + 1}</span>
                            <div>
                              <span className="text-white font-semibold">{r.ticker}</span>
                              {r.price !== undefined && (
                                <span className="text-white/50 text-sm ml-2">
                                  ${r.price.toFixed(2)}
                                  {r.changePct !== undefined && (
                                    <span className={r.changePct >= 0 ? 'text-green-500 ml-1' : 'text-red-500 ml-1'}>
                                      ({r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%)
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {r.score !== null ? (
                              <span className={`font-bold ${getScoreColor(r.score)}`}>
                                {r.score}/100
                              </span>
                            ) : (
                              <span className="text-white/40 text-sm">No score</span>
                            )}
                            {onSelectStock && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-gold hover:text-gold-light hover:bg-gold/10 h-8 px-2"
                                onClick={() => onSelectStock(r.ticker)}
                              >
                                View
                              </Button>
                            )}
                            <button
                              onClick={() => setResults((prev) => prev.filter((item) => item.ticker !== r.ticker))}
                              className="p-1.5 rounded-md text-white/40 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                              title="Remove ticker"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))}

                      {rawText && (
                        <div className="border border-white/10 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setShowRawText((v) => !v)}
                            className="w-full flex items-center justify-between p-3 bg-[#141414] text-white/70 text-sm hover:text-white transition-colors"
                          >
                            <span>Raw OCR text</span>
                            <span className="text-white/40">{showRawText ? 'Hide' : 'Show'}</span>
                          </button>
                          {showRawText && (
                            <div className="p-3 bg-[#0f0f0f] text-white/50 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                              {rawText}
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
