import { useState, useMemo } from 'react'
import { ArrowDownUp, Zap, Clock, RefreshCw } from 'lucide-react'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { WidgetContainer } from '../base/WidgetContainer'
import { addNotification } from '@/features/notifications/notificationsSlice'

const commonTokens = [
  { value: 'SOL', label: 'SOL', mint: 'So11111111111111111111111111111111111111112' },
  { value: 'USDC', label: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  { value: 'USDT', label: 'USDT', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' },
  { value: 'JUP', label: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
  { value: 'BONK', label: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
  { value: 'WIF', label: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
]

const formatNumber = (num: number, decimals = 2) => {
  if (num === 0) return '0'
  if (num < 0.0001) return num.toExponential(2)
  if (num < 1) return num.toFixed(Math.max(decimals, 4))
  return num.toLocaleString(undefined, { maximumFractionDigits: decimals })
}

const formatUSD = (num: number) => {
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

type TradeMode = 'swap' | 'limit'

export function TradeEntryWidget() {
  const dispatch = useAppDispatch()
  const { holdings, connected } = useAppSelector((state) => state.portfolio)
  const { prices } = useAppSelector((state) => state.prices)

  const [mode, setMode] = useState<TradeMode>('swap')
  const [inputToken, setInputToken] = useState('SOL')
  const [outputToken, setOutputToken] = useState('USDC')
  const [inputAmount, setInputAmount] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [slippage, setSlippage] = useState('0.5')
  const [expiry, setExpiry] = useState('24h')
  const [isLoading, setIsLoading] = useState(false)

  const inputHolding = holdings.find((h) => h.symbol === inputToken)
  const inputBalance = inputHolding?.balance || 0
  const inputMint = commonTokens.find((t) => t.value === inputToken)?.mint || inputHolding?.mint || ''
  const outputMint = commonTokens.find((t) => t.value === outputToken)?.mint || ''
  const inputPrice = inputHolding?.price || prices[inputMint] || 0
  const outputPrice = prices[outputMint] || 1

  const currentRate = inputPrice / outputPrice

  const estimatedOutput = useMemo(() => {
    if (!inputAmount || !inputPrice || !outputPrice) return 0
    if (mode === 'limit' && limitPrice) {
      return parseFloat(inputAmount) * parseFloat(limitPrice)
    }
    return (parseFloat(inputAmount) * inputPrice) / outputPrice
  }, [inputAmount, inputPrice, outputPrice, mode, limitPrice])

  const usdValue = useMemo(() => {
    if (!inputAmount || !inputPrice) return 0
    return parseFloat(inputAmount) * inputPrice
  }, [inputAmount, inputPrice])

  const handleSwapTokens = () => {
    const temp = inputToken
    setInputToken(outputToken)
    setOutputToken(temp)
    setInputAmount('')
    setLimitPrice('')
  }

  const handlePercentClick = (pct: number) => {
    setInputAmount((inputBalance * pct).toFixed(6))
  }

  const handleSwap = async () => {
    if (!inputAmount || parseFloat(inputAmount) <= 0) return

    setIsLoading(true)
    try {
      const inputMintAddr = commonTokens.find((t) => t.value === inputToken)?.mint
      const outputMintAddr = commonTokens.find((t) => t.value === outputToken)?.mint

      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputMint: inputMintAddr,
          outputMint: outputMintAddr,
          amount: parseFloat(inputAmount),
          slippageBps: parseFloat(slippage) * 100,
          strategy: 'Manual Swap',
        }),
      })

      const data = await res.json()
      if (data.success) {
        dispatch(addNotification({
          title: 'Swap Successful',
          message: `Swapped ${inputAmount} ${inputToken} for ${outputToken}`,
          type: 'success',
        }))
        setInputAmount('')
      } else {
        dispatch(addNotification({
          title: 'Swap Failed',
          message: data.error || 'Unknown error',
          type: 'error',
        }))
      }
    } catch (err) {
      dispatch(addNotification({
        title: 'Swap Error',
        message: 'Failed to execute swap',
        type: 'error',
      }))
    } finally {
      setIsLoading(false)
    }
  }

  const handleLimitOrder = async () => {
    if (!inputAmount || parseFloat(inputAmount) <= 0 || !limitPrice) return

    setIsLoading(true)
    try {
      const inputMintAddr = commonTokens.find((t) => t.value === inputToken)?.mint
      const outputMintAddr = commonTokens.find((t) => t.value === outputToken)?.mint

      const expiryHours = expiry === '1h' ? 1 : expiry === '24h' ? 24 : expiry === '7d' ? 168 : 24

      const res = await fetch('/api/limit/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputMint: inputMintAddr,
          outputMint: outputMintAddr,
          inAmount: parseFloat(inputAmount),
          outAmount: parseFloat(inputAmount) * parseFloat(limitPrice),
          expiryHours,
        }),
      })

      const data = await res.json()
      if (data.success) {
        dispatch(addNotification({
          title: 'Limit Order Placed',
          message: `Order to sell ${inputAmount} ${inputToken} at ${limitPrice} ${outputToken}`,
          type: 'success',
        }))
        setInputAmount('')
        setLimitPrice('')
      } else {
        dispatch(addNotification({
          title: 'Order Failed',
          message: data.error || 'Unknown error',
          type: 'error',
        }))
      }
    } catch (err) {
      dispatch(addNotification({
        title: 'Order Error',
        message: 'Failed to place limit order',
        type: 'error',
      }))
    } finally {
      setIsLoading(false)
    }
  }

  if (!connected) {
    return (
      <WidgetContainer
        id="trade-entry"
        title="Trade"
        icon={<ArrowDownUp className="w-4 h-4" />}
      >
        <div className="h-full flex flex-col items-center justify-center text-white/40">
          <ArrowDownUp className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">Connect wallet to trade</p>
        </div>
      </WidgetContainer>
    )
  }

  return (
    <WidgetContainer
      id="trade-entry"
      title="Trade"
      icon={<ArrowDownUp className="w-4 h-4" />}
      noPadding
    >
      <div className="p-4 space-y-4">
        {/* Mode Tabs */}
        <div className="flex items-center gap-1 p-1 bg-white/[0.03] rounded-lg">
          <button
            onClick={() => setMode('swap')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              mode === 'swap'
                ? 'bg-accent-cyan/20 text-accent-cyan'
                : 'text-white/50 hover:text-white/70'
            )}
          >
            <RefreshCw size={14} />
            Swap
          </button>
          <button
            onClick={() => setMode('limit')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              mode === 'limit'
                ? 'bg-accent-purple/20 text-accent-purple'
                : 'text-white/50 hover:text-white/70'
            )}
          >
            <Clock size={14} />
            Limit
          </button>
        </div>

        {/* Input Section */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-white/50 uppercase tracking-wider">You pay</span>
            <span className="text-[11px] text-white/50">
              Balance: <span className="font-mono text-white/70">{formatNumber(inputBalance, 4)}</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              placeholder="0.00"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              className="flex-1 bg-transparent text-xl font-semibold text-white placeholder:text-white/20 focus:outline-none font-mono"
            />
            <select
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              className="bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:border-accent-cyan/30"
            >
              {commonTokens.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-white/40">{formatUSD(usdValue)}</span>
            <div className="flex items-center gap-1">
              {[0.25, 0.5, 0.75, 1].map((pct) => (
                <button
                  key={pct}
                  onClick={() => handlePercentClick(pct)}
                  className="px-2 py-0.5 text-[10px] rounded bg-white/[0.05] text-white/50 hover:bg-white/[0.08] hover:text-white/70 transition-colors"
                >
                  {pct === 1 ? 'MAX' : `${pct * 100}%`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center py-1">
          <button
            onClick={handleSwapTokens}
            className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white/50 hover:text-accent-cyan hover:border-accent-cyan/30 transition-all"
          >
            <ArrowDownUp size={16} />
          </button>
        </div>

        {/* Output Section */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-white/50 uppercase tracking-wider">You receive</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 text-xl font-semibold text-white/70 font-mono">
              {estimatedOutput > 0 ? formatNumber(estimatedOutput, 4) : '0.00'}
            </div>
            <select
              value={outputToken}
              onChange={(e) => setOutputToken(e.target.value)}
              className="bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:border-accent-cyan/30"
            >
              {commonTokens.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Limit Order: Price Input */}
        {mode === 'limit' && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-white/50 uppercase tracking-wider">Limit Price</span>
              <button
                onClick={() => setLimitPrice(currentRate.toFixed(6))}
                className="text-[10px] text-accent-cyan hover:text-accent-cyan/80 transition-colors"
              >
                Use Market ({formatNumber(currentRate, 4)})
              </button>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                placeholder="0.00"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                className="flex-1 bg-transparent text-xl font-semibold text-white placeholder:text-white/20 focus:outline-none font-mono"
              />
              <span className="text-sm text-white/50">{outputToken} per {inputToken}</span>
            </div>
          </div>
        )}

        {/* Trade Info */}
        {inputAmount && parseFloat(inputAmount) > 0 && (
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 space-y-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-white/50">Rate</span>
              <span className="font-mono text-white/70">
                1 {inputToken} = {formatNumber(mode === 'limit' && limitPrice ? parseFloat(limitPrice) : currentRate, 4)} {outputToken}
              </span>
            </div>

            {mode === 'swap' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-white/50">Slippage</span>
                  <div className="flex items-center gap-1">
                    {['0.1', '0.5', '1.0'].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSlippage(s)}
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] transition-colors',
                          slippage === s
                            ? 'bg-accent-cyan/20 text-accent-cyan'
                            : 'bg-white/[0.05] text-white/50 hover:text-white/70'
                        )}
                      >
                        {s}%
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/50">Min. received</span>
                  <span className="font-mono text-white/70">
                    {formatNumber(estimatedOutput * (1 - parseFloat(slippage) / 100), 4)} {outputToken}
                  </span>
                </div>
              </>
            )}

            {mode === 'limit' && (
              <div className="flex items-center justify-between">
                <span className="text-white/50">Expiry</span>
                <div className="flex items-center gap-1">
                  {['1h', '24h', '7d'].map((e) => (
                    <button
                      key={e}
                      onClick={() => setExpiry(e)}
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] transition-colors',
                        expiry === e
                          ? 'bg-accent-purple/20 text-accent-purple'
                          : 'bg-white/[0.05] text-white/50 hover:text-white/70'
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={mode === 'swap' ? handleSwap : handleLimitOrder}
          disabled={
            isLoading ||
            !inputAmount ||
            parseFloat(inputAmount) <= 0 ||
            parseFloat(inputAmount) > inputBalance ||
            (mode === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0))
          }
          className={cn(
            'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            mode === 'swap'
              ? 'bg-accent-cyan text-black hover:bg-accent-cyan/90'
              : 'bg-accent-purple text-white hover:bg-accent-purple/90'
          )}
        >
          {isLoading ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : mode === 'swap' ? (
            <Zap size={16} />
          ) : (
            <Clock size={16} />
          )}
          {!inputAmount || parseFloat(inputAmount) <= 0
            ? 'Enter amount'
            : parseFloat(inputAmount) > inputBalance
            ? 'Insufficient balance'
            : mode === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)
            ? 'Enter limit price'
            : mode === 'swap'
            ? 'Swap'
            : 'Place Limit Order'}
        </button>
      </div>
    </WidgetContainer>
  )
}
