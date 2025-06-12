import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Typography,
  Link,
  Box,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { listRecordings } from '@/app/lib/dropboxUtils';

interface Recording {
  name: string;
  path: string;
  shareableUrl: string;
  timestamp: string;
}

interface RecordingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function RecordingsDialog({ open, onClose }: RecordingsDialogProps) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadRecordings();
    }
  }, [open]);

  const loadRecordings = async () => {
    try {
      setLoading(true);
      setError(null);
      const records = await listRecordings();
      setRecordings(records);
    } catch (err) {
      setError('Failed to load recordings. Please try again later.');
      console.error('Error loading recordings:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="recordings-dialog-title"
    >
      <DialogTitle id="recordings-dialog-title">
        <Box display="flex" justifyContent="space-between" alignItems="center">
          Student Recordings
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{ color: 'grey.500' }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Typography color="error" align="center">
            {error}
          </Typography>
        ) : recordings.length === 0 ? (
          <Typography align="center">
            No recordings found.
          </Typography>
        ) : (
          <List>
            {recordings.map((recording) => (
              <ListItem
                key={recording.path}
                divider
                sx={{ flexDirection: 'column', alignItems: 'flex-start' }}
              >
                <ListItemText
                  primary={recording.name}
                  secondary={formatDate(recording.timestamp)}
                />
                <Box mt={1}>
                  <Link
                    href={recording.shareableUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ textDecoration: 'none' }}
                  >
                    Download Recording
                  </Link>
                </Box>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
} 