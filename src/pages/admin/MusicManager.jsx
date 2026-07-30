import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import '../../styles/music-manager.css'

const MUSIC_BUCKET = 'restaurant-music'
const VOLUME_LEVELER_SETTINGS = {
  threshold: -26,
  knee: 24,
  ratio: 8,
  attack: 0.005,
  release: 0.28,
  makeupGain: 1.28,
}

function getTrackUrl(track) {
  if (track.public_url) return track.public_url
  if (!track.storage_path) return ''

  const { data } = supabase.storage.from(MUSIC_BUCKET).getPublicUrl(track.storage_path)
  return data?.publicUrl || ''
}

function formatDuration(seconds) {
  if (!seconds || typeof seconds !== 'number') return ''

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function isBirthdayTrack(track) {
  const mood = String(track?.mood || '').toLowerCase()
  const title = String(track?.title || '').toLowerCase()

  return (
    mood.includes('cumple') ||
    mood.includes('birthday') ||
    mood.includes('compleanno') ||
    title.includes('cumple') ||
    title.includes('birthday') ||
    title.includes('compleanno')
  )
}

function getRandomTrackIndex(tracks, currentIndex) {
  if (!tracks.length) return 0
  if (tracks.length === 1) return 0

  let nextIndex = currentIndex

  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * tracks.length)
  }

  return nextIndex
}

export default function MusicManager({ setCurrentPage }) {
  const audioRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioSourceRef = useRef(null)
  const compressorRef = useRef(null)
  const makeupGainRef = useRef(null)
  const [tracks, setTracks] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [specialTrack, setSpecialTrack] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.7)
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(true)
  const [isVolumeLevelingEnabled, setIsVolumeLevelingEnabled] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [playerMessage, setPlayerMessage] = useState('')

  const regularTracks = useMemo(
    () => tracks.filter((track) => !isBirthdayTrack(track)),
    [tracks]
  )

  const birthdayTrack = useMemo(
    () => tracks.find(isBirthdayTrack) || null,
    [tracks]
  )

  const currentTrack = useMemo(
    () => specialTrack || regularTracks[currentIndex] || null,
    [specialTrack, regularTracks, currentIndex]
  )

  const createAudioGraph = async () => {
    const audioElement = audioRef.current
    const AudioContextClass = window.AudioContext || window.webkitAudioContext

    if (!audioElement || !AudioContextClass) return

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass()
    }

    const audioContext = audioContextRef.current

    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    if (!audioSourceRef.current) {
      audioSourceRef.current = audioContext.createMediaElementSource(audioElement)
    }

    if (!compressorRef.current) {
      const compressor = audioContext.createDynamicsCompressor()
      compressor.threshold.value = VOLUME_LEVELER_SETTINGS.threshold
      compressor.knee.value = VOLUME_LEVELER_SETTINGS.knee
      compressor.ratio.value = VOLUME_LEVELER_SETTINGS.ratio
      compressor.attack.value = VOLUME_LEVELER_SETTINGS.attack
      compressor.release.value = VOLUME_LEVELER_SETTINGS.release
      compressorRef.current = compressor
    }

    if (!makeupGainRef.current) {
      const makeupGain = audioContext.createGain()
      makeupGain.gain.value = VOLUME_LEVELER_SETTINGS.makeupGain
      makeupGainRef.current = makeupGain
    }

    audioSourceRef.current.disconnect()
    compressorRef.current.disconnect()
    makeupGainRef.current.disconnect()

    if (isVolumeLevelingEnabled) {
      audioSourceRef.current
        .connect(compressorRef.current)
        .connect(makeupGainRef.current)
        .connect(audioContext.destination)
    } else {
      audioSourceRef.current.connect(audioContext.destination)
    }
  }

  const setupAudioGraph = async () => {
    try {
      await createAudioGraph()
    } catch (error) {
      console.error(error)
      setPlayerMessage('El nivelador de volumen no se pudo activar. La reproducción seguirá en modo normal.')
    }
  }

  const playBirthdayTrack = () => {
    if (!birthdayTrack) return

    setSpecialTrack(birthdayTrack)
    setIsPlaying(true)
    setPlayerMessage('')
  }

  const loadTracks = async () => {
    setIsLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase
      .from('music_tracks')
      .select('id, title, artist, storage_path, public_url, duration_seconds, mood, active, sort_order, created_at')
      .eq('active', true)
      .order('sort_order', { ascending: true })

    if (error) {
      setErrorMessage(error.message)
      setTracks([])
      setCurrentIndex(0)
      setSpecialTrack(null)
      setIsPlaying(false)
      setIsLoading(false)
      return
    }

    const playableTracks = (data || [])
      .map((track) => ({
        ...track,
        audio_url: getTrackUrl(track)
      }))
      .filter((track) => track.audio_url)

    setTracks(playableTracks)
    setCurrentIndex(0)
    setSpecialTrack(null)
    setIsPlaying(false)
    setPlayerMessage('')
    setIsLoading(false)
  }

  useEffect(() => {
    loadTracks()
  }, [])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume])

  useEffect(() => {
    if (!regularTracks.length || currentIndex <= regularTracks.length - 1) return

    setCurrentIndex(0)
  }, [currentIndex, regularTracks.length])

  useEffect(() => {
    if (!audioSourceRef.current) return

    setupAudioGraph()
  }, [isVolumeLevelingEnabled])

  useEffect(() => {
    if (!audioRef.current || !currentTrack || !isPlaying) return

    const startPlayback = async () => {
      await setupAudioGraph()

      audioRef.current
        .play()
        .then(() => {
          setPlayerMessage('')
        })
        .catch((error) => {
          setIsPlaying(false)
          setPlayerMessage(error.message || 'No se pudo iniciar la reproducción.')
        })
    }

    startPlayback()
  }, [currentTrack, isPlaying])

  const playCurrentTrack = async () => {
    if (!audioRef.current || !currentTrack) return

    setPlayerMessage('')

    try {
      await setupAudioGraph()
      await audioRef.current.play()
      setIsPlaying(true)
    } catch (error) {
      setIsPlaying(false)
      setPlayerMessage(error.message || 'No se pudo iniciar la reproducción.')
    }
  }

  const pauseCurrentTrack = () => {
    if (!audioRef.current) return

    audioRef.current.pause()
    setIsPlaying(false)
  }

  const handlePlayPause = () => {
    if (isPlaying) {
      pauseCurrentTrack()
    } else {
      playCurrentTrack()
    }
  }

  const selectTrack = (index) => {
    setSpecialTrack(null)
    setCurrentIndex(index)
    setPlayerMessage('')
  }

  const toggleShuffle = () => {
    setSpecialTrack(null)
    setIsShuffleEnabled((enabled) => !enabled)
    setPlayerMessage('')
  }

  const toggleVolumeLeveling = () => {
    setIsVolumeLevelingEnabled((enabled) => !enabled)
    setPlayerMessage('')
  }

  const goToPreviousTrack = () => {
    setSpecialTrack(null)

    if (!regularTracks.length) {
      setIsPlaying(false)
      return
    }

    setCurrentIndex((index) => {
      if (isShuffleEnabled) return getRandomTrackIndex(regularTracks, index)
      return index === 0 ? regularTracks.length - 1 : index - 1
    })
    setPlayerMessage('')
  }

  const goToNextTrack = () => {
    setSpecialTrack(null)

    if (!regularTracks.length) {
      setIsPlaying(false)
      return
    }

    setCurrentIndex((index) => {
      if (isShuffleEnabled) return getRandomTrackIndex(regularTracks, index)
      return (index + 1) % regularTracks.length
    })
    setPlayerMessage('')
  }

  const handleAudioEnded = () => {
    if (specialTrack) {
      setSpecialTrack(null)
      setIsPlaying(false)
      return
    }

    setIsPlaying(true)
    goToNextTrack()
  }

  const handleAudioPause = () => {
    if (audioRef.current?.ended) return
    setIsPlaying(false)
  }

  return (
    <section className="admin-page">
      <button className="back-button" onClick={() => setCurrentPage('admin')} type="button">
        ← Volver al panel admin
      </button>

      <div className="admin-header">
        <div>
          <p className="eyebrow">Sala</p>
          <h2>Music Manager</h2>
          <p>Playlist sala, riproduzione e controllo ambiente.</p>
        </div>
      </div>

      <div className="dashboard-panel music-manager-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Now playing</p>
            <h3>Ambiente sala</h3>
          </div>
          <button className="ghost-button" onClick={loadTracks} type="button" disabled={isLoading}>
            {isLoading ? 'Cargando...' : 'Actualizar playlist'}
          </button>
        </div>

        {errorMessage && <p className="form-error">{errorMessage}</p>}

        <div className="music-player-card">
          <div>
            <p className="eyebrow">{specialTrack ? 'Pista especial' : 'Pista actual'}</p>
            <h3>{currentTrack?.title || 'Ninguna pista seleccionada'}</h3>
            <p>{currentTrack?.artist || 'Selecciona una canción para comenzar.'}</p>
          </div>

          <div className="music-controls">
            <button className="ghost-button" onClick={goToPreviousTrack} type="button" disabled={!regularTracks.length}>
              ⏮
            </button>
            <button className="primary-button" onClick={handlePlayPause} type="button" disabled={!currentTrack}>
              {isPlaying ? 'Pausar' : 'Reproducir'}
            </button>
            <button className="ghost-button" onClick={goToNextTrack} type="button" disabled={!regularTracks.length}>
              ⏭
            </button>
          </div>

          <div className="music-extra-controls">
            <button
              className={isShuffleEnabled ? 'primary-button' : 'ghost-button'}
              onClick={toggleShuffle}
              type="button"
              disabled={!regularTracks.length}
            >
              {isShuffleEnabled ? '🔀 Shuffle activo' : '🔀 Shuffle'}
            </button>
            <button
              className={isVolumeLevelingEnabled ? 'primary-button' : 'ghost-button'}
              onClick={toggleVolumeLeveling}
              type="button"
              disabled={!currentTrack}
            >
              {isVolumeLevelingEnabled ? '🎚 Nivelador activo' : '🎚 Nivelador'}
            </button>
            {birthdayTrack && (
              <button className="ghost-button" onClick={playBirthdayTrack} type="button">
                🎂 Reproducir cumpleaños
              </button>
            )}
          </div>

          <label className="music-volume-control">
            Volumen
            <input
              max="1"
              min="0"
              onChange={(event) => setVolume(Number(event.target.value))}
              step="0.05"
              type="range"
              value={volume}
            />
          </label>

          {playerMessage && <p className="form-help">{playerMessage}</p>}

          <audio
            ref={audioRef}
            crossOrigin="anonymous"
            src={currentTrack?.audio_url || ''}
            onEnded={handleAudioEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={handleAudioPause}
          />
        </div>

        <div className="music-playlist-list">
          {regularTracks.map((track, index) => {
            const isActive = currentTrack?.id === track.id

            return (
              <button
                className={`music-track-row ${isActive ? 'active' : ''}`}
                key={track.id}
                onClick={() => selectTrack(index)}
                type="button"
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{track.title}</strong>
                <small>{track.artist}</small>
                <em>{formatDuration(track.duration_seconds)}</em>
              </button>
            )
          })}

          {!isLoading && !regularTracks.length && (
            <p className="empty-state">No hay canciones activas en Supabase.</p>
          )}
        </div>
      </div>
    </section>
  )
}
