import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'

const MUSIC_BUCKET = 'restaurant-music'

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

export default function MusicManager({ setCurrentPage }) {
  const audioRef = useRef(null)
  const [tracks, setTracks] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.7)
  const [errorMessage, setErrorMessage] = useState('')
  const [playerMessage, setPlayerMessage] = useState('')

  const currentTrack = useMemo(
    () => tracks[currentIndex] || null,
    [tracks, currentIndex]
  )

  const birthdayTrackIndex = useMemo(() => {
    return tracks.findIndex((track) => {
      const mood = String(track.mood || '').toLowerCase()
      const title = String(track.title || '').toLowerCase()

      return (
        mood.includes('cumple') ||
        mood.includes('birthday') ||
        title.includes('cumple') ||
        title.includes('birthday')
      )
    })
  }, [tracks])

  const birthdayTrack = birthdayTrackIndex >= 0 ? tracks[birthdayTrackIndex] : null

  const playBirthdayTrack = () => {
    if (birthdayTrackIndex < 0) return
    setCurrentIndex(birthdayTrackIndex)
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
    if (!audioRef.current || !currentTrack || !isPlaying) return

    audioRef.current
      .play()
      .then(() => {
        setPlayerMessage('')
      })
      .catch((error) => {
        setIsPlaying(false)
        setPlayerMessage(error.message || 'No se pudo iniciar la reproducción.')
      })
  }, [currentTrack, isPlaying])

  const playCurrentTrack = async () => {
    if (!audioRef.current || !currentTrack) return

    setPlayerMessage('')

    try {
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
    setCurrentIndex(index)
    setPlayerMessage('')
  }

  const goToPreviousTrack = () => {
    if (!tracks.length) return

    setCurrentIndex((index) => (index === 0 ? tracks.length - 1 : index - 1))
    setPlayerMessage('')
  }

  const goToNextTrack = () => {
    if (!tracks.length) return

    setCurrentIndex((index) => (index + 1) % tracks.length)
    setPlayerMessage('')
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

          <button className="ghost-button" type="button" onClick={loadTracks} disabled={isLoading}>
            {isLoading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>

        <div className="birthday-action-bar">
          {birthdayTrack ? (
            <button
              className="ghost-button small birthday-button"
              type="button"
              onClick={playBirthdayTrack}
            >
              🎂 Reproducir cumpleaños
            </button>
          ) : (
            <p className="birthday-note">
              Añade una pista con mood "Cumpleaños" para activar el botón de cumpleaños.
            </p>
          )}
        </div>

        {errorMessage && <p className="empty-state">Error: {errorMessage}</p>}

        {!isLoading && !errorMessage && tracks.length === 0 && (
          <p className="empty-state">No hay pistas activas disponibles.</p>
        )}

        {currentTrack && (
          <>
            <div className="music-now-playing">
              <div>
                <span>{currentTrack.mood || 'Mood sin definir'}</span>
                <h3>{currentTrack.title}</h3>
                <p>{currentTrack.artist || 'Artista sin definir'}</p>
              </div>
              {currentTrack.duration_seconds && <strong>{formatDuration(currentTrack.duration_seconds)}</strong>}
            </div>

            <audio
              ref={audioRef}
              src={currentTrack.audio_url}
              preload="metadata"
              onEnded={goToNextTrack}
              onError={() => {
                setIsPlaying(false)
                setPlayerMessage('No se pudo cargar esta pista.')
              }}
            />

            <div className="music-controls">
              <button className="ghost-button" type="button" onClick={goToPreviousTrack}>
                Previous
              </button>
              <button className="primary-button" type="button" onClick={handlePlayPause}>
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button className="ghost-button" type="button" onClick={goToNextTrack}>
                Next
              </button>
            </div>

            <label className="music-volume">
              Volumen
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
              />
              <span>{Math.round(volume * 100)}%</span>
            </label>

            {playerMessage && <p className="empty-state">{playerMessage}</p>}
          </>
        )}
      </div>

      {tracks.length > 0 && (
        <div className="dashboard-panel">
          <div>
            <p className="eyebrow">Playlist</p>
            <h3>Pistas activas</h3>
          </div>

          <div className="music-track-list">
            {tracks.map((track, index) => (
              <button
                className={`music-track${index === currentIndex ? ' active' : ''}`}
                key={track.id}
                type="button"
                onClick={() => selectTrack(index)}
              >
                <span>{track.sort_order ?? index + 1}</span>
                <div>
                  <strong>{track.title}</strong>
                  <small>
                    {track.artist || 'Artista sin definir'}
                    {track.mood ? ` · ${track.mood}` : ''}
                  </small>
                </div>
                {track.duration_seconds && <b>{formatDuration(track.duration_seconds)}</b>}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
