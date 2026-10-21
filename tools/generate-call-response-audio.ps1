param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\assets\audio\call-response')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null

$lines = @(
  @('assistant-departure-signal.wav', 'Microsoft Huihui Desktop', '出站信号'),
  @('assistant-green-departure-ok.wav', 'Microsoft Huihui Desktop', '绿灯，出站好了'),
  @('assistant-departure-ready.wav', 'Microsoft Huihui Desktop', '发车信号'),
  @('assistant-dispatch-ready-ok.wav', 'Microsoft Huihui Desktop', '联控发车好了'),
  @('assistant-confirm-departure-time.wav', 'Microsoft Huihui Desktop', '确认开车时刻'),
  @('assistant-ok.wav', 'Microsoft Huihui Desktop', '好了'),
  @('assistant-rear-attention.wav', 'Microsoft Huihui Desktop', '后部注意'),
  @('assistant-rear-ok.wav', 'Microsoft Huihui Desktop', '后部好了'),
  @('assistant-align-attention.wav', 'Microsoft Huihui Desktop', '注意对标'),
  @('assistant-instruments-attention.wav', 'Microsoft Huihui Desktop', '仪表注意'),
  @('assistant-tail-query.wav', 'Microsoft Huihui Desktop', '列尾查询'),
  @('assistant-no-double-panto.wav', 'Microsoft Huihui Desktop', '禁止双弓'),
  @('assistant-power-off.wav', 'Microsoft Huihui Desktop', '断电'),
  @('assistant-power-on.wav', 'Microsoft Huihui Desktop', '闭合'),
  @('assistant-through-signal.wav', 'Microsoft Huihui Desktop', '通过信号'),
  @('assistant-green.wav', 'Microsoft Huihui Desktop', '绿灯'),
  @('assistant-green-yellow.wav', 'Microsoft Huihui Desktop', '绿黄灯'),
  @('assistant-yellow-slow.wav', 'Microsoft Huihui Desktop', '黄灯，减速'),
  @('assistant-confirm-position.wav', 'Microsoft Huihui Desktop', '确认车位'),
  @('assistant-position-correct.wav', 'Microsoft Huihui Desktop', '车位正确'),
  @('assistant-entry-signal.wav', 'Microsoft Huihui Desktop', '进站信号'),
  @('assistant-yellow-mainline.wav', 'Microsoft Huihui Desktop', '黄灯，正线'),
  @('driver-green-departure-ok.wav', 'Microsoft Kangkang', '绿灯，出站好了'),
  @('driver-dispatch-ready-ok.wav', 'Microsoft Kangkang', '联控发车好了'),
  @('driver-departure-on-time.wav', 'Microsoft Kangkang', '正点开车'),
  @('driver-rear-ok.wav', 'Microsoft Kangkang', '后部好了'),
  @('driver-aligned.wav', 'Microsoft Kangkang', '对标好了'),
  @('driver-instruments-normal.wav', 'Microsoft Kangkang', '各仪表显示正常'),
  @('driver-tail-pressure-600.wav', 'Microsoft Kangkang', '尾部风压六百千帕'),
  @('driver-single-panto-ok.wav', 'Microsoft Kangkang', '单弓好了'),
  @('driver-power-off-ok.wav', 'Microsoft Kangkang', '断电好了'),
  @('driver-power-on-ok.wav', 'Microsoft Kangkang', '闭合好了'),
  @('driver-green.wav', 'Microsoft Kangkang', '绿灯'),
  @('driver-green-yellow.wav', 'Microsoft Kangkang', '绿黄灯'),
  @('driver-yellow-slow.wav', 'Microsoft Kangkang', '黄灯，减速'),
  @('driver-position-correct.wav', 'Microsoft Kangkang', '车位正确'),
  @('driver-yellow-mainline.wav', 'Microsoft Kangkang', '黄灯，正线')
)

$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $synth.Rate = -1
  $synth.Volume = 100
  foreach ($line in $lines) {
    $file, $voice, $text = $line
    $synth.SelectVoice($voice)
    $target = Join-Path $resolvedOutput $file
    $synth.SetOutputToWaveFile($target)
    $synth.Speak($text)
    $synth.SetOutputToNull()
  }
} finally {
  $synth.Dispose()
}

Write-Output "Generated $($lines.Count) call-response audio files in $resolvedOutput"
